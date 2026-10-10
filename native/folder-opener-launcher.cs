using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

// Chrome 的原生消息清单只识别 name、description、path、type、allowed_origins 五个字段，
// 不会解析 args。清单里的 path 必须是一个“不带参数也能运行”的可执行文件：
// 如果直接把 powershell.exe 写进 path，Chrome 会启动一个没有任何参数的 PowerShell，
// 它会把你发来的二进制帧当成命令去执行，协议立刻损坏，扩展只能看到 lastError。
//
// 所以安装脚本把 path 指向本启动器。它读取一条带 4 字节长度前缀的请求，
// 转交给同目录下的 PowerShell 工作脚本 folder-opener-host.ps1，再把响应原样写回 Chrome。
// chrome.runtime.sendNativeMessage 每次调用都会新启动一个宿主进程，因此这里只处理一条消息。
internal static class FolderOpenerLauncher
{
    private const int MaxMessageLength = 1024 * 1024;

    private static byte[] ReadExactly(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0) throw new EndOfStreamException("原生消息请求提前结束。");
            offset += read;
        }
        return buffer;
    }

    // 按 CreateProcess 的规则转义一个命令行参数（安装路径里可能有空格）。
    private static string QuoteArgument(string value)
    {
        StringBuilder quoted = new StringBuilder();
        quoted.Append('"');
        int pendingBackslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                pendingBackslashes += 1;
                continue;
            }
            if (character == '"')
            {
                quoted.Append('\\', pendingBackslashes * 2 + 1);
                quoted.Append('"');
            }
            else
            {
                quoted.Append('\\', pendingBackslashes);
                quoted.Append(character);
            }
            pendingBackslashes = 0;
        }
        quoted.Append('\\', pendingBackslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static string QuoteJson(string value)
    {
        StringBuilder text = new StringBuilder();
        text.Append('"');
        string source = value ?? string.Empty;
        for (int index = 0; index < source.Length; index += 1)
        {
            char character = source[index];
            switch (character)
            {
                case '"': text.Append("\\\""); break;
                case '\\': text.Append("\\\\"); break;
                case '\b': text.Append("\\b"); break;
                case '\f': text.Append("\\f"); break;
                case '\n': text.Append("\\n"); break;
                case '\r': text.Append("\\r"); break;
                case '\t': text.Append("\\t"); break;
                default:
                    if (character < ' ') text.Append("\\u").Append(((int)character).ToString("x4"));
                    else text.Append(character);
                    break;
            }
        }
        text.Append('"');
        return text.ToString();
    }

    private static void WriteFrame(Stream stream, string json)
    {
        byte[] body = new UTF8Encoding(false).GetBytes(json);
        byte[] header = BitConverter.GetBytes((uint)body.Length);
        stream.Write(header, 0, header.Length);
        stream.Write(body, 0, body.Length);
        stream.Flush();
    }

    // 失败时也要回一条协议内的响应，扩展才能显示真正的原因，
    // 而不是只看到 Chrome 的 “native host has exited”。
    private static void WriteErrorFrame(Stream stream, string message)
    {
        try { WriteFrame(stream, "{\"ok\":false,\"message\":" + QuoteJson(message) + "}"); }
        catch (Exception) { }
    }

    private static long CopyStream(Stream source, Stream target)
    {
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
        {
            target.Write(buffer, 0, read);
            total += read;
        }
        target.Flush();
        return total;
    }

    private static int Main()
    {
        Stream output = Console.OpenStandardOutput();
        try
        {
            Stream input = Console.OpenStandardInput();
            byte[] header = ReadExactly(input, 4);
            uint length = BitConverter.ToUInt32(header, 0);
            if (length == 0 || length > MaxMessageLength) throw new InvalidDataException("原生消息请求长度无效。");
            byte[] payload = ReadExactly(input, (int)length);

            string hostRoot = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(hostRoot, "folder-opener-host.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("找不到本地目录打开助手工作脚本 folder-opener-host.ps1，请重新运行安装脚本。", script);

            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string powershell = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            if (!File.Exists(powershell)) throw new FileNotFoundException("找不到 Windows PowerShell，无法启动原生目录助手。", powershell);

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = powershell;
            start.Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " + QuoteArgument(script);
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;

            using (Process worker = Process.Start(start))
            {
                if (worker == null) throw new InvalidOperationException("无法启动 PowerShell 工作进程。");

                // 先并发转发 stderr，避免工作进程写满管道缓冲区后卡死。
                Task stderrCopy = Task.Factory.StartNew(delegate
                {
                    CopyStream(worker.StandardError.BaseStream, Console.OpenStandardError());
                });

                Stream workerInput = worker.StandardInput.BaseStream;
                workerInput.Write(header, 0, header.Length);
                workerInput.Write(payload, 0, payload.Length);
                workerInput.Flush();
                worker.StandardInput.Close();

                long forwarded = CopyStream(worker.StandardOutput.BaseStream, output);
                worker.WaitForExit();
                stderrCopy.Wait();

                if (forwarded == 0)
                {
                    WriteErrorFrame(output, "本地目录打开助手没有返回结果（工作进程退出码 " + worker.ExitCode + "），请重新运行安装脚本。");
                    return 1;
                }
                return worker.ExitCode;
            }
        }
        catch (Exception error)
        {
            WriteErrorFrame(output, error.Message);
            try { Console.Error.WriteLine(error.ToString()); } catch (Exception) { }
            return 1;
        }
    }
}
