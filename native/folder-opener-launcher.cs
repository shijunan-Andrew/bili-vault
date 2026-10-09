using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

// Chrome launches a native host executable and only supplies the caller origin
// and parent-window arguments. This launcher forwards one framed request to the
// PowerShell worker, then copies its framed response back to Chrome unchanged.
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
            if (read <= 0) throw new EndOfStreamException("Native Messaging request ended early.");
            offset += read;
        }
        return buffer;
    }

    private static string QuoteArgument(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static int Main(string[] args)
    {
        try
        {
            Stream input = Console.OpenStandardInput();
            byte[] header = ReadExactly(input, 4);
            uint length = BitConverter.ToUInt32(header, 0);
            if (length == 0 || length > MaxMessageLength)
                throw new InvalidDataException("Native Messaging request length is invalid.");
            byte[] payload = ReadExactly(input, (int)length);

            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string powershell = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            string script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "folder-opener-host.ps1");
            if (!File.Exists(powershell)) throw new FileNotFoundException("Windows PowerShell was not found.", powershell);
            if (!File.Exists(script)) throw new FileNotFoundException("Folder opener worker script was not found.", script);

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
                if (worker == null) throw new InvalidOperationException("Could not start the PowerShell worker.");
                Task stderrCopy = Task.Run(() => worker.StandardError.BaseStream.CopyTo(Console.OpenStandardError()));
                Stream workerInput = worker.StandardInput.BaseStream;
                workerInput.Write(header, 0, header.Length);
                workerInput.Write(payload, 0, payload.Length);
                workerInput.Flush();
                worker.StandardInput.Close();

                worker.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput());
                worker.WaitForExit();
                stderrCopy.Wait();
                return worker.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

}
