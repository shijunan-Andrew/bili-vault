/**
 * base.core.js
 * http://www.bilibili.com/
 */

var tidSet = [1, 3, 4, 5, 11, 13, 23, 36, 119, 129];

if (typeof window.console == 'undefined') {
	window.console = {
		log: function() {}
	};
}

if (!Array.prototype.indexOf) {
	Array.prototype.indexOf = function(elt, from) {
		var len = this.length >>> 0;

		var from = Number(arguments[1]) || 0;
		from = (from < 0) ? Math.ceil(from) : Math.floor(from);
		if (from < 0)
			from += len;

		for (; from < len; from++) {
			if (from in this &&
				this[from] === elt)
				return from;
		}
		return -1;
	};
}

if (typeof Object.defineProperty == "function") {
	try {
		Object.defineProperty(Array.prototype, "shuffle", {
			enumerable: false,
			writable: true
		});
	} catch (error) {

	}
	Array.prototype.shuffle = function() {
		for (var j, x, i = this.length; i; j = parseInt(Math.random() * i), x = this[--i], this[i] = this[j], this[j] = x) {}
		return this;
	};
}
var array_shuffle = function(array) {
	for (var j, x, i = array.length; i; j = parseInt(Math.random() * i), x = array[--i], array[i] = array[j], array[j] = x) {}
	return array;
};

var utils = {
	uncurryThis: function(f) {
		return function() {
			return f.call.apply(f, arguments)
		};
	},
	curryThis: function(f) {
		return function() {
			var a = Array.prototype.slice.call(arguments);
			a.unshift(this);
			return f.apply(null, a);
		};
	},

	bindFn: function(fn, context) {
		var _args = Array.prototype.slice.call(arguments, 2);
		return function() {
			return fn.apply(context, _args.concat(Array.prototype.slice.call(arguments)))
		}
	},

	extend: function(child, parent) {
		for (var key in parent) {
			if (parent.hasOwnProperty(key)) child[key] = parent[key];
		}

		function ctor() {}
		ctor.prototype = parent.prototype;
		child.prototype = new ctor();
		child.prototype.constructor = child;
		child.__super__ = parent.prototype;
		return child;
	},

	mixin: function(dest) {
		var sources = Array.prototype.slice.call(arguments, 1);
		for (var i = 0; i < sources.length; i++) {
			var src = sources[i];
			for (var key in src) {
				if (!dest[key]) {
					dest[key] = src[key];
				}
			}
		}
	},

	distinctArray: function(arr) {
		var newArray = [],
			dict = {},
			i = 0,
			item;
		for (; i < arr.length; i++) {
			item = arr[i];
			var key = item + ':' + typeof item;
			if (!dict[key]) {
				newArray.push(item);
				dict[key] = item;
			}
		}
		return newArray;
	},

	/*
	 * 访问终端信息判断
	 */
	browser: {
		version: (function() {
			var u = navigator.userAgent,
				app = navigator.appVersion;
			return { //移动终端浏览器版本信息
				trident: (/Trident/i).test(u), //IE内核
				presto: (/Presto/i).test(u), //opera内核
				webKit: (/AppleWebKit/i).test(u), //苹果、谷歌内核
				gecko: (/Gecko/i).test(u) && !(/KHTML/i).test(u), //火狐内核
				mobile: (/AppleWebKit.*Mobile.*/i).test(u), //是否为移动终端
				ios: (/\(i[^;]+;( U;)? CPU.+Mac OS X/i).test(u), //ios终端
				android: (/Android/i).test(u) || (/Linux/i).test(u), //android终端或者uc浏览器
				windowsphone: (/Windows Phone/i).test(u), //Windows Phone
				iPhone: (/iPhone/i).test(u), //是否为iPhone或者QQHD浏览器
				iPad: (/iPad/i).test(u), //是否iPad
				MicroMessenger: (/MicroMessenger/i).test(u), //是否为微信
				webApp: !(/Safari/i).test(u) //是否web应该程序，没有头部与底部
			};
		})(),
		language: (navigator.browserLanguage || navigator.language).toLowerCase()
	},

	cookie: {
		get: function(cookieName) {
			var theCookie = "" + document.cookie;
			var ind = theCookie.indexOf(cookieName + "=");
			if (ind == -1 || cookieName == "")
				return "";
			var ind1 = theCookie.indexOf(';', ind);
			if (ind1 == -1)
				ind1 = theCookie.length;
			return unescape(theCookie.substring(ind + cookieName.length + 1, ind1));
		},

		set: function(name, value, days) {
			days = days !== undefined ? days : 365;
			var exp = new Date();
			exp.setTime(exp.getTime() + days * 24 * 60 * 60 * 1000);
			document.cookie = name + "=" + escape(value) + ";expires=" + exp.toGMTString() + "; path=/; domain=.bilibili.com";
		},

		'delete': function(name) {
			this.set(name, '', -1);
		}
	},

	readFromLocal: function(key) {
		if (this.localStorage._support) {
			return localStorage.getItem(key);
		} else {
			return this.cookie.get(key);
		}
	},

	saveToLocal: function(key, val, days) {
		if (this.localStorage._support) {
			return localStorage.setItem(key, val);
		} else {
			return this.cookie.set(key, val, days);
		}
	},

	localStorage: {
		_support: window.localStorage && typeof window.localStorage == 'object' ? true : false,
		getItem: function(key) {
			if (this._support) {
				return window.localStorage.getItem(key);
			} else {
				return null;
			}
		},
		setItem: function(key, value) {
			if (this._support) {
				window.localStorage.setItem(key, value);
			}
		},
		removeItem: function(key) {
			if (this.getItem(key)) {
				window.localStorage.removeItem(key);
			}
		}
	},

	unhtml: function(str, reg) {
		return str ? str.replace(reg || /[&<">'](?:(amp|lt|quot|gt|#39|nbsp|#\d+);)?/g, function(a, b) {
			if (b) {
				return a;
			} else {
				return {
					'<': '&lt;',
					'&': '&amp;',
					'"': '&quot;',
					'>': '&gt;',
					"'": '&#39;'
				}[a]
			}

		}) : '';
	},

	html: function(str) {
		return str ? str.replace(/&((g|l|quo)t|amp|#39|nbsp);/g, function(m) {
			return {
				'&lt;': '<',
				'&amp;': '&',
				'&quot;': '"',
				'&gt;': '>',
				'&#39;': "'",
				'&nbsp;': ' '
			}[m]
		}) : '';
	},

	HashManage: {
		prependHash: '!',
		_change: function(key, value) {
			var hash = location.hash,
				hashArray, hashMap = {},
				hashString = '',
				index = 0;
			if (hash) {
				hash = hash.substring(1);
				if (this.prependHash) {
					hash = hash.replace(new RegExp('^' + this.prependHash.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&")), '');
				}
			}
			hashArray = hash.split('&');
			for (var i = 0; i < hashArray.length; i++) {
				var _k = hashArray[i].split('=')[0],
					_v = hashArray[i].split('=')[1];
				if (_k) {
					hashMap[_k] = decodeURIComponent(_v);
				}
			}

			if (typeof key == 'object') {
				for (var j in key) {
					var _val = key[j];
					if (_val) {
						hashMap[j] = encodeURIComponent(_val);
					} else if (_val === false) {
						delete hashMap[j];
					}
				}
			} else {
				if (value) {
					hashMap[key] = encodeURIComponent(value);
				} else if (value === false) {
					delete hashMap[key];
				} else if (typeof key == 'undefined') {
					return hashMap;
				} else {
					return hashMap[key] || null;
				}
			}


			for (var k in hashMap) {
				if (index != 0) {
					hashString += '&';
				} else {
					hashString += this.prependHash;
				}
				hashString += (k + '=' + hashMap[k]);
				index++;
			}
			location.hash = hashString;
			return hashMap;
		},

		get: function(key) {
			return this._change(key, null);
		},
		set: function(key, value) {
			return this._change(key, value);
		},
		clear: function() {
			location.hash = '';
		}
	},

	getColor16: function(rgb) {
		function _to16(d) {
			var color = parseInt(d).toString(16);
			return color.length == 1 ? "0" + color : color;
		}

		function _parse(array) {
			var value = "#";
			for (var i = 0; i < 3; i++) {
				value += _to16(array[i]);
			}
			return value;
		}
		var result = "";
		var rgbArray = [];
		if (rgb.match(/\((.*)\)/) != null) {
			rgbArray = rgb.match(/\((.*)\)/)[1].split(",");
			result = _parse(rgbArray);
		} else if (rgb.match(/,+/g) != null) {
			rgbArray = rgb.split(",");
			result = _parse(rgbArray);
		} else {
			result = _to16(rgb);
		}
		return result;
	},

	serializeParam: function(json) {
		var strArr = [];
		for (var i in json) {
			if (!((typeof json[i]).toLowerCase() == "function" || (typeof json[i]).toLowerCase() == "object")) {
				strArr.push(encodeURIComponent(i) + "=" + encodeURIComponent(json[i]));
			} else if ($.isArray(json[i])) {
				//支持传数组内容
				for (var j = 0; j < json[i].length; j++) {
					strArr.push(encodeURIComponent(i) + "[]=" + encodeURIComponent(json[i][j]));
				}
			}
		}
		return strArr.join("&");
	},

	query2json: function(query) {
		if ($.isPlainObject(query)) {
			return query;
		}
		if (query === undefined) {
			return {};
		}
		var q = query.split("&"),
			j = {};
		for (var i = 0; i < q.length; i++) {
			var arr = q[i].split('=');
			j[arr[0]] = arr[1];
		}
		return j;
	},

	hash2json: function() {
		if (window.location.href.split('#').length > 1) {
			return this.query2json(window.location.href.split('#')[1].split('?')[0].replace(/#/, ""));
		} else {
			return {};
		}
	},

	query: {
		get: function(key) {
			var queryJson = utils.query2json(this._getQuery());
			if (key) {
				return queryJson[key];
			} else {
				return queryJson;
			}
		},
		set: function(key, value) {
			var queryJson = utils.query2json(this._getQuery());
			var hashJson = utils.hash2json();
			if (typeof key == 'object') {
				for (var k in key) {
					this._set(queryJson, k, key[k]);
				}
			} else {
				this._set(queryJson, key, value);
			}
			return utils.makeUrl('', queryJson, hashJson);
		},
		_set: function(json, key, value) {
			if (value === null) {
				delete json[key];
			} else {
				json[key] = value;
			}
			return json;
		},
		_getQuery: function() {
			if(window.location.search !== undefined) {
				return window.location.search.substring(1);
			} else {
				return window.location.href.split('?')[1] ? window.location.href.split('?')[1].split('#')[0] : '';
			}
		}
	},

	makeUrl: function(url, queryJson, hashJson) {
		var query = this.serializeParam(queryJson),
			hash = this.serializeParam(hashJson),
			_url;
		if (query) {
			_url = (url || location.pathname) + '?' + query;
		} else {
			_url = url || location.pathname;
		}

		if (hash) {
			_url = _url + '#' + hash;
		}

		return _url;
	},

	formatNum: function(num, unit) {
		if (num === undefined || typeof num == 'string' && isNaN(parseInt(num))) return '--';
		var unitMap = {
				'万': 10000
			},
			defaultUnit = '万';
		unit = typeof unit == 'string' ? unit : defaultUnit;
		var factor = unitMap[unit] || unitMap[defaultUnit];
		if (typeof num == 'string' && num.indexOf(unit) >= 0) return;
		if (typeof num == 'string' && num.indexOf(",") >= 0) {
			var nums = num.split(",");
			var total = "";
			for (var i = 0; i < nums.length; i++) {
				total += nums[i];
			}
			num = total;
		}
		num = parseInt(num);

		if (num >= factor) {
			num = (num / factor).toFixed(1) + unit;
		}

		return num;
	},

	parseCardProps: function(dataItem, type) {
		var props = {
				'data-gk': dataItem.play,
				'data-sc': dataItem.favorites,
				'data-pl': dataItem.review,
				'data-dm': dataItem.video_review,
				'data-up': dataItem.author,
				'data-subtitle': dataItem.subtitle,
				'data-lm': dataItem.typename || '',
				'data-tg': dataItem.create,
				'data-txt': dataItem.description,
				'data-yb': dataItem.coins
			},
			str = "";
		if (type == 'string') {
			for (var k in props) {
				if (str != "") {
					str += " ";
				}
				str += k + '="' + props[k] + '"';
			}
			return str;
		} else {
			return props;
		}
	},

	// protocol-relative 为了兼容ie8以下
	protocolRelative: function(url) {
		if (/http:|https:/.test(url)) {
			return url.replace(/http:|https:/, window.location.protocol);
		} else if ($.browser.msie && parseInt($.browser.version) <= 8) {
			return window.location.protocol + url;
		} else {
			return url;
		}
	}
};


/**
 * @deprecated 部分旧的全局函数，use utils instead.
 */
window['__GetCookie'] = utils.bindFn(utils.cookie.get, utils);

window['__SetCookie'] = utils.bindFn(utils.cookie.set, utils);

window['ChatGetSettings'] = utils.bindFn(utils.readFromLocal, utils);

window['ChatSaveSettings'] = utils.bindFn(utils.saveToLocal, utils);

window['htmlspecialchars'] = utils.bindFn(utils.unhtml, utils);

window['browser'] = utils.browser;

window['formatFriendlyNumber'] = utils.bindFn(utils.formatNum, utils);


var lastMessageBoxLayer = 20000;
/** Define MessageBox Class **/
/**
 * 支持4个显示方位+视区4条边界检测+两种动画效果
 */
function MessageBox(params) {
	this.params = {
		evType: "over",
		Overlap: false,
		focusShowPos: "down",
		zIndex: null,
		animation: "slide",
		position: null,
		event: null,
		bound: true
	};
	if (typeof(params) == 'string') {
		params = {
			evType: params
		};
	}
	if (typeof params != 'object') {
		return;
	}
	for (var k in this.params) {
		if (params.hasOwnProperty(k)) {
			this.params[k] = params[k];
		}
	}
};
MessageBox.prototype = {
	timer: null,
	msgbox: null,
	bindobj: null,
	incomingTimer: null,
	position: {},
	reverseMap: {
		"up": "down",
		"down": "up",
		"left": "right",
		"right": "left"
	},
	show: function(obj, msg, timeout, icon, onclick) {
		/**
		icon:
		ok
		warning
		question
		msg
		button
		**/
		obj = $(obj);
		if (this.params.Overlap == false && obj.attr('hasMessageBox') == 'yes') return;
		obj.attr('hasMessageBox', 'yes');
		if (typeof(timeout) == "undefined") timeout = 1000;
		if (typeof(icon) == "undefined") icon = "msg";
		if (timeout == "button") {
			onclick = icon;
			icon = timeout;
			timeout = 1000;
		}
		var vtimeout = timeout;
		if (timeout == 0) vtimeout = 50;
		var ricon = icon;
		if (icon == "button") ricon = "question";
		var self = this;
		self.leftTimer = function() {
			if (icon == 'button') return;
			clearTimeout(self.timer);
			self.timer = setTimeout(function() {
				clearTimeout(self.timer);
				self.close(self);
			}, vtimeout);
		};
		self.incomingTimer = function() {
			clearTimeout(self.timer);
		}
		this.bindobj = obj;

		this.msgbox = $('<div class="m_layer"><div class="bg"><div class="content"><div class="mini"><b class="' + ricon + '"></b>' + msg + (icon == 'button' ? '<div class="btnbox"><a class="b-btn ok">确认</a><a class="b-btn-cancel cancel">取消</a></div>' : '') + '</div></div></div></div>').prependTo("body");

		if (this.params.evType == 'over') {
			obj.bind('mouseleave', self.leftTimer);
			obj.bind('mouseenter', self.incomingTimer);
			this.msgbox.bind('mouseenter', function() {
				clearTimeout(self.timer);
			});
			this.msgbox.bind('mouseleave', self.leftTimer);
		} else {
			obj.bind('blur', self.leftTimer);
		}


		this.setPos();
		//console.log("MessageBox().position("+$(obj).attr('title')+") = "+self.position.left+","+self.position.top);
		this.msgbox.css("z-index", self.params.zIndex || lastMessageBoxLayer++);
		this.msgbox.hide();

		if (icon == "button") {
			this.msgbox.find(".ok").click(function() {
				if (typeof(onclick) == "undefined" || onclick(self) != false) {
					self.close();
				}
			});
			this.msgbox.find(".cancel").click(function() {
				self.close();
			});
		}
		if (timeout != 0) self.leftTimer();
		if (this.params.animation != 'fade') {
			this.msgbox.slideDown(200);
		} else {
			this.moveIn(this.params.focusShowPos);
		}
		return this.msgbox;
	},
	close: function() {
		var self = this;
		this.bindobj.attr('hasMessageBox', '');
		if (this.params.animation != 'fade') {
			this.msgbox.slideUp(200);
		} else {
			this.msgbox.fadeOut(200);
		}
		setTimeout(function() {
			self.msgbox.remove();
			if (self.params.evType == 'over') {
				self.bindobj.off('mouseenter', self.incomingTimer);
			}
			self.bindobj.off(self.params.evType == 'over' ? 'mouseleave' : 'blur', self.leftTimer);
		}, 200);
	},
	moveIn: function(pos) {
		var aniData = {
			"opacity": 1
		};
		var _moveT = 5,
			_moveL = 5;
		switch (pos) {
			case "up":
				aniData["top"] = "-=5";
				_moveL = 0;
				break;
			case "down":
				aniData["top"] = "+=5";
				_moveT = -_moveT;
				_moveL = 0;
				break;
			case "left":
				aniData["left"] = "-=5";
				_moveT = 0;
				break;
			case "right":
				aniData["left"] = "+=5";
				_moveL = -_moveL;
				_moveT = 0;
				break;
			default:
				aniData["top"] = "-=5";
				_moveL = 0;
		}
		this.msgbox.show().css({
			"top": this.position.top + _moveT,
			"left": this.position.left + _moveL,
			"opacity": 0
		});
		this.msgbox.animate(aniData, 200);
	},
	setPos: function() {
		if (this.params.position) {
			this.position = this.params.position;
			this.resetBound();
		} else {
			this._pos(this.params.focusShowPos);
		}

		this.msgbox.css("left", this.position.left + "px");
		this.msgbox.css("top", this.position.top + "px");
	},
	_pos: function(direction, reversed) {
		var obj = this.bindobj;
		this.params.focusShowPos = direction;
		switch (direction) {
			case "up":
				this.position.top = obj.offset().top - this.msgbox.outerHeight();
				this.position.left = obj.offset().left;
				break;
			case "down":
				this.position.top = obj.offset().top + obj.outerHeight();
				this.position.left = obj.offset().left;
				break;
			case "left":
				this.position.top = obj.offset().top;
				this.position.left = obj.offset().left - this.msgbox.outerWidth();
				break;
			case "right":
				this.position.top = obj.offset().top;
				this.position.left = obj.offset().left + obj.outerWidth();
				break;
			default:
				;
		}
		if (!this.checkBound(direction)) {
			if (reversed !== true) {
				return this._pos(this.reverseMap[direction], true);
			} else {
				this.setBound('down');
				this.setBound('left');
				this.position.top -= 10;
				this.position.left += 10;
			}
		}
		this.resetBound();
		return this.position;
	},
	resetBound: function(force) {
		if (!this.params.bound && force !== true) {
			return;
		}
		var directions = ["up", "down", "left", "right"];
		for (var i = 0; i < directions.length; i++) {
			var dir = directions[i];
			if (!this.checkBound(dir)) {
				this.setBound(dir);
			}
		}
	},
	checkBound: function(direction) {
		switch (direction) {
			case "up":
				return this.position.top >= $(window).scrollTop();
			case "down":
				return this.position.top + this.msgbox.outerHeight() <= $(window).height() + $(window).scrollTop();
			case "left":
				return this.position.left >= $(window).scrollLeft();
			case "right":
				return this.position.left + this.msgbox.outerWidth() <= $(window).width() + $(window).scrollLeft();
			default:
				return true;
		}
	},
	setBound: function(direction) {
		switch (direction) {
			case "up":
				this.position.top = $(window).scrollTop();
				break;
			case "down":
				this.position.top = $(window).height() + $(window).scrollTop() - this.msgbox.outerHeight();
				break;
			case "left":
				this.position.left = $(window).scrollLeft();
				break;
			case "right":
				this.position.left = $(window).width() + $(window).scrollLeft() - this.msgbox.outerWidth();
				break;
			default:
				;
		}
	}
};

function pagelist(target, page, pages, results, callback, unit, listsize, pageInput) {
	var list_len = listsize ? listsize : 3;

	page = parseInt(page);
	pages = parseInt(pages);
	results = parseInt(results);

	if (pages <= 1 && results > 0) {
		return false;
	}
	if (results == 0) {
		return false;
	}

	//获得数字链接
	var j;
	var listdd = "";
	var total_list = list_len * 2 + 1;
	if (page >= total_list) {
		j = page - list_len;
		total_list = page + list_len;
		if (total_list > pages) {
			total_list = pages;
		}
	} else {
		j = 1;
		if (total_list > pages) {
			total_list = pages;
		}
	}
	$(target).empty();
	if (unit != null) {
		$("<span class=\"result\">共 " + pages + " 页/ " + results + " 个" + unit + " </span>").appendTo(target);
	} else {
		$("<span class=\"result\">共 " + pages + " 页 </span>").appendTo(target);
	}
	//获得上一页和下一页的链接
	if (page != 1) {
		$("<a class=\"b-btn indexPage\" href=\"javascript:;\" page=\"1\">首页 </a>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
		$("<a class=\"b-btn prevPage\" href=\"javascript:;\" page=\"" + (page - 1) + "\">上页 </a>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
	}
	for (; j <= total_list; j++) {
		if (j == page) {
			$("<strong>" + j + "</strong>").appendTo(target);
		} else {
			$("<a class=\"p\" href=\"javascript:;\" page=\"" + j + "\">" + j + "</a>").appendTo(target).click(function() {
				callback($(this).attr("page"));
			});
		}
	}
	if (page != pages && pages > 1) {
		$("<a class=\"b-btn nextPage\" href=\"javascript:;\" page=\"" + (page + 1) + "\">下页</a>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
	}
	if (page != pages && pages > 1) {
		$("<a class=\"b-btn endPage\" href=\"javascript:;\" page=\"" + pages + "\">末页</a>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
	} else {
		//$("<strong class=\"b-btn endPage\">末页</strong>").appendTo(target);
	}
	if (pageInput === true) {
		var input = $('<input type="text" class="custompage">').appendTo(target);
		var submit = $('<a class="button">确定</a>').appendTo(target).click(function() {
			var _page = input.val();
			if (_page < 1) {
				_page = 1;
			} else if (_page > pages) {
				_page = pages;
			}
			callback(_page);
		});
	}
}

function pagelist_ul(target, page, pages, results, callback, listsize) {
	var list_len = listsize ? listsize : 3;

	page = parseInt(page);
	pages = parseInt(pages);
	results = parseInt(results);

	if (pages <= 1 && results > 0) {
		return false;
	}
	if (results == 0) {
		return false;
	}

	//获得数字链接
	var j;
	var listdd = "";
	var total_list = list_len * 2 + 1;
	if (page >= total_list) {
		j = page - list_len;
		total_list = page + list_len;
		if (total_list > pages) {
			total_list = pages;
		}
	} else {
		j = 1;
		if (total_list > pages) {
			total_list = pages;
		}
	}
	$(target).empty();
	//获得上一页和下一页的链接
	if (page != 1 && j != 1) {
		$("<li page=\"1\"><a class=\"indexPage\" href=\"javascript:;\">|&lt;</a></li>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
	} else if (page != 1) {
		$("<li page=\"1\"><a class=\"indexPage\" href=\"javascript:;\">|&lt;</a></li>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
	}
	for (; j <= total_list; j++) {
		if (j == page) {
			$("<li class=\"current\">" + j + "</li>").appendTo(target);
		} else {
			$("<li page=\"" + j + "\"><a href=\"javascript:;\">" + j + "</a></li>").appendTo(target).click(function() {
				callback($(this).attr("page"));
			});
		}
	}
	if (page != pages && pages > 1) {
		$("<li page=\"" + pages + "\"><a class=\"endPage\" href=\"javascript:;\">&gt;|</a></li>").appendTo(target).click(function() {
			callback($(this).attr("page"));
		});
	}
}

/**
 * 评论模块
 */
window['bbFeedback'] = (function() {
	var lastPage = "";

	function reloadFeedback() {
		if (window.feedback_object) {
			window.feedback_object.orderby = 'default';
			window.feedback_object.show(window.feedback_object.id, 1);
		} else if ($("#fb_tp_id").length > 0) {
			loadTopicFB($("#fb_tp_id").val(), 1);
		} else if ($("#fb_aid").length > 0) {
			loadFB($("#fb_aid").val(), 1);
		} else {
			loadFB($("#fb_news_id").val(), 1);
		}
	}

	window['CallPlayerAction'] = function(code) {
		// console.log("CallPlayerAction: "+code);
		switch (code) {
			case 1:
				var isJSFB = $("#comment_container").length >= 1;
				if ($("#review_comments_tips").length == 0) {
					$("<div class=\"new_comm\"><span id=\"review_comments_tips\" tag=\"0\"></span></div>").prependTo(isJSFB ? "#comment_container>ul" : ".comm > ul").on('click', function() {
						reloadFeedback();
					});
				}
				num = parseInt($("#review_comments_tips").attr("tag")) + 1;
				$("#review_comments_tips").attr("tag", num);
				$("#review_comments_tips").html("<b>" + num + "</b> 条新评论，点击查看");
				break;
		}
	}

	function loadFB(aid, page, callback) {
		var curPage = "/feedback/arc-" + aid + "\-" + page + ".html?r=" + Math.random();
		if (curPage == lastPage) return;
		lastPage = curPage;
		$(".comm > .loading").remove();
		$('<div class="loading"></div>').prependTo(".comm");
		var startTime = new Date();
		$.ajax(lastPage, {
			success: function(data) {
				var dur = new Date().getTime() - startTime.getTime();
				if (dur < 500) {
					setTimeout(function() {
						$(".comm").html(data);
						if (typeof(callback) != "undefined") callback();
						bindCardEvent();
					}, 300 - dur <= 0 ? 10 : 300 - dur);
				} else {
					$(".comm").html(data);
					if (typeof(callback) != "undefined") callback();
					bindCardEvent();
				}
			}
		});
	}

	function loadTopicFB(aid, page, callback) {
		var curPage = "/feedback/topic-" + aid + "\-" + page + ".html?r=" + Math.random();
		if (curPage == lastPage) return;
		lastPage = curPage;
		$(".comm > .loading").remove();
		$('<div class="loading"></div>').prependTo(".comm");
		var startTime = new Date();
		$.ajax(lastPage, {
			success: function(data) {
				var dur = new Date().getTime() - startTime.getTime();
				if (dur < 500) {
					setTimeout(function() {
						$(".comm").html(data);
						if (typeof(callback) != "undefined") callback();
						bindCardEvent();
					}, 300 - dur <= 0 ? 10 : 300 - dur);
				} else {
					$(".comm").html(data);
					if (typeof(callback) != "undefined") callback();
					bindCardEvent();
				}
			}
		});
	}

	function agFB(obj, aid, mode, rid) {
		var param = "";
		switch (mode) {
			case "arc":
				param = "aid=" + aid;
				break;
			case "news":
				param = "news_id=" + aid;
				break;
			case "topic":
				param = "tp_id=" + aid;
				break;
		}
		$.ajax({
			type: "get",
			url: "http://interface.bilibili.com/feedback/agreement?mode=" + mode + "&" + param + "&rid=" + rid + "&callback=?",
			dataType: "jsonp",
			success: function(data) {
				if (data != "OK") {
					(new MessageBox()).show(obj, data, 2000, "warning");
				} else {
					var h = $(obj).children("b").html();
					h = h.substr(2);
					h = h.substr(0, h.length - 1);
					$(obj).children("b").html("(+" + (parseInt(h) + 1) + ")");
					(new MessageBox()).show(obj, "赞同成功", 500, "info");
				}
			},
			error: function() {
				(new MessageBox()).show(obj, "发送失败，请检查您的网络或发送邮件至 orz#hdslb.com", 2000, "error");
			}
		});
		return false;
	}

	function dagFB(obj, aid, mode, rid) {
		var param = "";
		switch (mode) {
			case "arc":
				param = "aid=" + aid;
				break;
			case "news":
				param = "news_id=" + aid;
				break;
			case "topic":
				param = "tp_id=" + aid;
				break;
		}
		$.ajax({
			type: "get",
			url: "http://interface.bilibili.com/feedback/disagreement?mode=" + mode + "&" + param + "&rid=" + rid + "&callback=?",
			dataType: "jsonp",
			success: function(data) {
				if (data != "OK") {
					(new MessageBox()).show(obj, data, 2000, "warning");
				} else {
					var h = $(obj).children("b").html();
					h = h.substr(2);
					h = h.substr(0, h.length - 1);
					$(obj).children("b").html("(+" + (parseInt(h) + 1) + ")");
					(new MessageBox()).show(obj, "反对成功", 500, "info");
				}
			},
			error: function() {
				(new MessageBox()).show(obj, "发送失败，请检查您的网络或发送邮件至 orz#hdslb.com", 2000, "error");
			}
		});
		return false;
	}

	function adDropFB(obj, mobj, aid, mode, rid) {
		var param = "";
		switch (mode) {
			case "arc":
				param = "aid=" + aid;
				break;
			case "news":
				param = "news_id=" + aid;
				break;
			case "topic":
				param = "tp_id=" + aid;
				break;
		}
		$.ajax({
			type: "get",
			url: "http://interface.bilibili.com/m/hideFeedback?" + param + "&drop=1&rid=" + rid + "&callback=?",
			dataType: "jsonp",
			success: function(data) {
				if (data != "OK") {
					(new MessageBox({
						Overlap: true,
						position: mobj.position
					})).show(obj, data, 2000, "warning");
				} else {
					(new MessageBox({
						Overlap: true,
						position: mobj.position
					})).show(obj, "删除成功", 500, "info");
					setTimeout(function() {
						$(obj).closest("li").slideUp(500);
					}, 500);
				}
			},
			error: function() {
				(new MessageBox({
					Overlap: true,
					position: mobj.position
				})).show(obj, "发送失败，请检查您的网络或发送邮件至 orz#hdslb.com", 2000, "error");
			}
		});
		return false;
	}

	function adHideFB(obj, aid, mode, rid) {
		if (obj == "undefined") obj = this;
		var param = "";
		switch (mode) {
			case "arc":
				param = "aid=" + aid;
				break;
			case "news":
				param = "news_id=" + aid;
				break;
			case "topic":
				param = "tp_id=" + aid;
				break;
		}
		$.ajax({
			type: "get",
			url: "http://interface.bilibili.com/m/hideFeedback?" + param + "&rid=" + rid + "&callback=?",
			dataType: "jsonp",
			success: function(data) {
				if (data != "OK") {
					(new MessageBox()).show(obj, data, 2000, "warning");
				} else {
					(new MessageBox()).show(obj, "隐藏成功", 500, "info");
					$(obj).parent().find(".showfb").show();
					$(obj).hide();
				}
			},
			error: function() {
				(new MessageBox()).show(obj, "发送失败，请检查您的网络或发送邮件至 orz#hdslb.com", 2000, "error");
			}
		});
		return false;
	}

	function adShowFB(obj, aid, mode, rid) {
		if (obj == "undefined") obj = this;
		var param = "";
		switch (mode) {
			case "arc":
				param = "aid=" + aid;
				break;
			case "news":
				param = "news_id=" + aid;
				break;
			case "topic":
				param = "tp_id=" + aid;
				break;
		}
		$.ajax({
			type: "get",
			url: "http://interface.bilibili.com/m/showFeedback?" + param + "&rid=" + rid + "&callback=?",
			dataType: "jsonp",
			success: function(data) {
				if (data != "OK") {
					(new MessageBox()).show(obj, data, 2000, "warning");
				} else {
					(new MessageBox()).show(obj, "显示成功", 500, "info");
					$(obj).parent().find(".hidefb").show();
					$(obj).hide();
				}
			},
			error: function() {
				(new MessageBox()).show(obj, "发送失败，请检查您的网络或发送邮件至 orz#hdslb.com", 2000, "error");
			}
		});
		return false;
	}

	function reportFB(obj, oid, type, fbid) {
        var msgobj = new MessageBox(),
            errMsgbox = new MessageBox();
        var msgbox = msgobj.show(obj, '<h3 style="text-align:left; color: #333;font-size: 14px;">请输入举报理由</h3><span class="b-btn-cancel-copy" style="color:#999;cursor:pointer;position:absolute;right:10px;top:8px;font-size:14px;font-family:Arial;">×</span>'
            +'<div class="reason-set"></div><textarea style="display:none;width:188px;border-radius:4px;border:1px solid #ccd0d7;height:58px;padding:5px;margin:5px 0;" name="message" placeholder="自定义理由"></textarea>', 'button', function() {
            var reasonType = msgbox.find('input[name="reason"]:checked').val(),
                reasonText = msgbox.find('textarea').val(),
                submitBtn = msgbox.find('.b-btn.ok');
            if(submitBtn.hasClass('disabled')) {
                return false;
            } else if (!reasonType || (reasonType == '0' && !reasonText)) {
                errMsgbox.show(submitBtn, '请完善举报理由');
                return false;
            }

            if(errMsgbox.msgbox) {
                errMsgbox.close();
            }

            submitBtn.css({
                'background': '#e5e9ef',
                'color': '#b8c0cc'
            });

            $.ajax({
                url: 'http://api.bilibili.com/x/reply/report?jsonp=jsonp',
                type: 'post',
                data: {
                    oid: oid,
                    type: type == 'arc' ? 1 : 2,
                    rpid: fbid,
                    reason: reasonType,
                    content: reasonText
                },
                xhrFields: {
                    withCredentials: true
                }
            }).done(function(res) {
                var reportFormTimeout;
                if (res.code == 0) {
                    msgbox.find('.mini').html('<span class="b-btn-cancel-copy" style="color:#999;cursor:pointer;position:absolute;right:10px;top:8px;font-size:14px;font-family:Arial;">×</span>' + '<div style="padding:61px 70px;width:60px;"><i style="margin:0 auto;background:transparent url(http://static.hdslb.com/images/v3images/done.png) no-repeat center;width:48px;height:48px;display:block;"></i><div style="text-align:center;font-size:13px;margin-top:15px;">举报成功</div></div>')

                    msgbox.find('.b-btn-cancel-copy').click(function() {
                        clearTimeout(reportFormTimeout);
                        msgobj.close();
                    });

                    reportFormTimeout = setTimeout(function() {
                        msgobj.close();
                    }, 3000);
                } else if (res.code == 12019) {
                    new MessageBox().show(submitBtn, '举报过于频繁，请' + res.data.ttl + '秒后重试');
                } else {
                    new MessageBox().show(submitBtn, '提交失败，请重试');
                }

            }).fail(function() {
                new MessageBox().show(submitBtn, '提交失败，请重试');
            }).complete(function() {
                submitBtn.css({
                    'background': '',
                    'color': ''
                });
            });
            return false;
        });

        if (!msgbox) {
            return;
        }
        msgbox.find('textarea').val('');
        var reasonSet = ['广告', '色情', '刷屏', '引战', '剧透', '政治', '人身攻击', '视频不相关', '其它'];
        var reasonBox = msgbox.find('.reason-set').css({
            'width': 200,
            'text-align': 'left',
            'padding-top': '10px'
        });
        for (var i = 0; i < reasonSet.length; i++) {
            $('<label style="cursor:pointer;"><input style="vertical-align:middle; margin-top:2px; margin-right:5px;" type="radio" name="reason" value="'+((i+1)%9)+'"/><span style="vertical-align:middle;">' + reasonSet[i] + '</span></label>').css({
                'vertical-align': 'top',
                'width': '98px',
                'line-height': '24px',
                'display': 'inline-block'
            }).appendTo(reasonBox);
        }
        msgbox.find('input[name="reason"]').change(function(){
            if($(this).val() == '0') {
                msgbox.find('textarea').show().val('');
            } else {
                msgbox.find('textarea').hide().val($(this).siblings('span').text());
            }
        });
        msgbox.find('.bg').css({
            'padding': '0px'
        });
        msgbox.css({
            'box-shadow': 'rgba(0,0,0,0.16) 0px 2px 4px'
        });
        msgbox.find('.question').hide();
        msgbox.find('.b-btn-cancel').hide();
        msgbox.find('.b-btn.ok').css({
            'padding': '7px 46px',
            'font-size': '14px',
            'margin': '5px 0',
            'border': 'none'
        });
        msgbox.find('.b-btn-cancel-copy').click(function(){
            msgobj.close();
        });

        return false;
	}

	function human_date(t) {
		var now = Math.floor(new Date().getTime() / 1000);
		var td_start = new Date();
		td_start.setHours(0);
		td_start.setMinutes(0);
		td_start.setSeconds(0);
		td_start = Math.floor(td_start.getTime() / 1000);
		if (t > td_start && now - t >= 0) {
			if (now - t <= 50) {
				var _t = Math.floor((now - t) % 60 / 10) * 10;
				return (t > 10 ? _t : 10) + "秒前";
			} else if (now - t < 3600) {
				return Math.ceil((now - t) / 60) + "分钟前";
			} else {
				return Math.ceil((now - t) / 3600) + "小时前";
			}
		} else {
			var n_d = new Date();
			n_d.setTime(t * 1000);
			var m = n_d.getMonth() + 1;
			var d = n_d.getDate();
			var H = n_d.getHours();
			var M = n_d.getMinutes();
			if (m < 10) m = "0" + m;
			if (d < 10) d = "0" + d;
			if (H < 10) H = "0" + H;
			if (M < 10) M = "0" + M;
			return n_d.getFullYear() + "-" + m + "-" + d + " " + H + ":" + M;
		}
	}

	function insertAtCursor(myField, myValue) {
		if (document.selection) {
			myField.focus();
			sel = document.selection.createRange();
			sel.text = myValue;
			sel.select();
		} else if (myField.selectionStart || myField.selectionStart == '0') {
			var startPos = myField.selectionStart;
			var endPos = myField.selectionEnd;
			var restoreTop = myField.scrollTop;
			myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
			if (restoreTop > 0) {
				myField.scrollTop = restoreTop;
			}
			myField.focus();
			myField.selectionStart = startPos + myValue.length;
			myField.selectionEnd = startPos + myValue.length;
		} else {
			myField.value += myValue;
			myField.focus();
		}
	}

	function setParentHeight() {
		try {
			if (window.parent && window.parent.document) {
				var parentBox = window.parent.document.getElementById('biliComment');
				if(parentBox) {
					parentBox.style.height = $('body').height() + 'px';
				}
			}
		} catch(e) {

		}
	}

	function bbFeedback(target, type, options) {
		this.type = type ? type : "arc";
		this.target = $('<div class="bilibili-comment"></div>').hide().appendTo(target).addClass('pc');
		this.options = $.extend(true, {
			allowFeed: false,
			useIframe: false,

            onLoad: null,
            onReplyLoad: null,
            onSubmit: null
		}, options);

		this.platform = "pc";
		if (browser.version.mobile && !browser.version.iPad) {
			this.target.removeClass('pc').addClass('mobile');
			this.platform = "mobile";
		} else if (browser.version.iPad || browser.version.android) {
			this.target.removeClass('pc');
			this.platform = "tablet";
		}

		window.feedback_object = this;
		this.captcha = window.captcha_key;
		this.mids = [];
		this.hasFeedMids = [];
		this.floorObjs = {};
		$("<style>#dcmp_textarea_container .ui-autocomplete{ margin-top: 5px; margin-left: -10px; max-width: 150px; }</style>").appendTo("head");
		this.loginInfo = null;

		this._quoteID = undefined;
		this._rootQuoteID = undefined;
		this.init();
	}
	bbFeedback.prototype = {
		isAdmin: -1,
		orderby: "default",
		init: function() {
			var self = this,
				bindWindow = this.bindWindow = window,
				bindTarget = this.bindTarget = this.target;

			if(this.options.useIframe) {
				try {
					if (window.parent && window.parent.document) {
						var parentBox = window.parent.document.getElementById('biliComment');
						if(parentBox) {
							bindWindow = this.bindWindow = window.parent;
							bindTarget = this.bindTarget = parentBox;
						}
					}
				} catch(e) {
					throw e;
				}
			}

			$(bindWindow.document).scroll(function() {
				var comm_send = $(".comm_send", self.target),
					offsetTop = self.options.useIframe ? $(bindTarget).offset().top : 0;
				if ($(bindTarget).height() > $(bindWindow).height()) {
					if ($(bindTarget).offset().top + $(bindTarget).height() < $(bindWindow).scrollTop() + $(bindWindow).height() && comm_send.offset().top + comm_send.outerHeight() + offsetTop < $(bindWindow).scrollTop()) {
						comm_send.appendTo(self.target).addClass("bottom");
					} else if ($(bindTarget).offset().top >= $(bindWindow).scrollTop() && comm_send.offset().top + offsetTop > $(bindWindow).scrollTop() + $(bindWindow).height()) {
						comm_send.prependTo(self.target).removeClass("bottom");
					}
				}
			});
			onLoginInfoLoaded(function(info) {
				self.loginInfo = info;
				self.checkLogin($('.tg_send_post', self.target));
			}, true);
		},
		checkLogin: function(bindObj) {
			var self = this;
			if (!this.loginInfo || !$('.tg_send_post', self.target).length) return;
			var submitBtn = $("button[type=submit]", bindObj).off('click.commentSubmitMsg');
			if (!this.loginInfo.isLogin) {
				$("#comment_text", bindObj).attr("placeholder", "请先登录");
				$(".user_face").addClass('no-face');
				$(".user_face img", bindObj).hide();
				submitBtn.on('click.commentSubmitMsg', function() {
					new MessageBox().show($(this), '请先<a href="https://account.bilibili.com/login" target="_blank">登录</a>', 1500, "warning");
				});
				return false;
			} else if((!this.loginInfo.level_info || this.loginInfo.level_info.current_level == 0 ) && (parseInt(window.mid) != parseInt(window.uid))) {
				$("#comment_text", bindObj).attr("placeholder", "会员等级不足，无法发表评论");
				$(".user_face").removeClass('no-face');
				$(".user_face img", bindObj).attr('src', this.loginInfo.face).show();
				submitBtn.on('click.commentSubmitMsg', function() {
					new MessageBox().show($(this), '会员等级不足，无法发表评论', 1500, "warning");
					return false;
				});
				return false;
			} else {
				$("#comment_text", bindObj).attr("placeholder", "在这里输入评论");
				$(".user_face").removeClass('no-face');
				$(".user_face img", bindObj).attr('src', this.loginInfo.face).show();
				if (!UserStatus.checkMoral()) {
					submitBtn.addClass('disabled');
					if (!$('.jc-help', bindObj).length) {
						$('<a class="jc-help" href="http://www.bilibili.com/html/help.html#j_4" target="_blank"><i class="b-tip jc"></i>如何恢复节操值？</a>').insertBefore(submitBtn);
					}
					if (!$('.jc-notice').length) {
						bindObj.find('.ipt-txt').before('<div class="ipt-txt jc-notice">你的节操已低于60，将无法发表评论，详情请点击<a href="https://account.bilibili.com/site/record?type=moral" target="_blank">我的节操记录</a></div>');
					}
				} else {
					submitBtn.removeClass('disabled');
					$('.jc-notice', bindObj).remove();
				}
				return true;
			}
		},
		pushUser: function(mid, floor) {
			if (typeof this.floorObjs[mid] == "undefined") {
				this.floorObjs[mid] = [];
			}
			this.floorObjs[mid].push(floor);
			if (this.mids.indexOf(mid) < 0 && this.hasFeedMids.indexOf(mid) < 0) {
				this.mids.push(mid);
				return true;
			}
			return false;
		},
		pushFeedUser: function(mid) {
			if (this.hasFeedMids.indexOf(mid) < 0) {
				this.hasFeedMids.push(mid);
				return true;
			}
			return false;
		},
		checkFeed: function(aid) {
			if (this.options.allowFeed !== true) {
				return;
			}
			var self = this;
			if (!this.captcha) {
				Captcha.set(function(captcha) {
					self.captcha = captcha;
				});
			}
			$.ajax({
				url: 'http://prop.bilibili.com/api/electric/has.feed',
				data: {
					mids: this.mids.join(),
					aid: aid,
					captcha: this.captcha
				},
				dataType: "json",
				type: "POST",
				xhrFields: {
					withCredentials: true
				},
				success: function(data) {
					if (data.code && data.code == -700) {
						Captcha.set(function(captcha) {
							self.captcha = captcha;
							self.checkFeed(aid);
						});
						return;
					}
					if (data.data && data.data.result) {
						for (var i = 0; i < data.data.result.length; i++) {
							var d = data.data.result[i];
							if (d.feed_status) {
								self.pushFeedUser(d.mid);
							}
						}
					}
					self.addFeedTag();
				},
				error: function() {

				}
			});
		},
		addFeedTag: function() {
			for (var i = 0; i < this.hasFeedMids.length; i++) {
				for (var j = 0; j < this.floorObjs[this.hasFeedMids[i]].length; j++) {
					var elem = this.floorObjs[this.hasFeedMids[i]][j];
					if (elem.find('.feedtag').length > 0) {
						continue;
					}
					var tag = $('<div>').addClass('feedtag');
					if (elem.parents('.reply').length > 0) {
						tag.insertAfter(elem.find('.name'));
					} else {
						elem.find('.t').append(tag);
					}
					var rankItem = $('#battery_ranking').find('[mid="' + this.hasFeedMids[i] + '"]');
					if (rankItem.length > 0) {
						var rank = parseInt(rankItem.attr('rank'));
						if (rank <= 3) {
							tag.addClass('n n' + rank);
						}
					}
				}
			}
		},
		initEmoji: function(container) {
            var toggle = 0,
                toggleBtn = container.find('.ywz'),
                box = container.find('.biaoqing_box');

            toggleBtn.click(function() {
                if (toggle == 0) {
                    $(this).addClass('open');
                    box.addClass('open');
                    toggle = 1;
                } else {
                    $(this).removeClass('open');
                    box.removeClass('open');
                    toggle = 0;
                }
            });
            $('a', box).click(function() {
                insertAtCursor($(".ipt-txt", container).get(0), $(this).html());
                toggleBtn.removeClass('open');
                box.removeClass('open');
                toggle = 0;
            });
        },
		recordToObject: function(c_Content, _r) {
			var at_regexp = new RegExp(/@([^\s:：@~!#$%^&*\(\)<]{2,15})/g);
			var av_regexp = new RegExp(/av([0-9]+)/g);

			function formatStr(str) {
				var string = str.replace(/\n/g, "<br />").replace(at_regexp, "<a href=\"javascript:;\" card=\"$1\">@$1</a>").replace(av_regexp, '<a href="/video/av$1/" target="_blank" data-view="$1">av$1</a>');
				return string;
			}
			if (_r.ad_check == 1) {
				$("<a href=\"javascript:;\">[此楼层已被用户隐藏 点击查看]</a>").appendTo(c_Content).click(function() {
					$(this).next().slideToggle(200);
				});
				$("<div style=\"display:none\" class=\"quote\">" + formatStr(_r.msg) + "</div>").appendTo(c_Content);
			} else if (_r.ad_check == 2) {
				if (window.uid == _r.mid) {
					c_Content.html(formatStr(_r.msg));
				} else {
					var del_msg = $("<a href=\"javascript:;\">[此楼层已被管理员删除]</a>").appendTo(c_Content);
				}
			} else if (_r.ad_check == 3) {
				$("<a href=\"javascript:;\">[此楼层已被举报并被管理员删除]</a>").appendTo(c_Content);
			} else {
				c_Content.html(formatStr(_r.msg));
			}
			bindPOCoins2(c_Content.find('a'));
		},
		reply_render: function(dat, rootFbid, _target) {
			var obj = $('<li>' +
				'<a class="re_face" href="http://space.bilibili.com/' + dat.mid + '" target="_blank" card="' + dat.nick + '"><img src="' + dat.face + '" /></a>' +
				'                <div class="re_cnt">' +
				'                   <div class="w"><a class="name" href="http://space.bilibili.com/' + dat.mid + '" target="_blank" card="' + dat.nick + '">' + dat.nick + '</a><a href="http://www.bilibili.com/html/help.html#k_3" target="_blank" class="user-info-level l' + (dat.level_info ? dat.level_info.current_level : 0) + '"></a>: <span class="content"></span></div>' +
				'                    <div class="info">' +
				'                    	<p>' +
				(this.isAdmin >= 0 ? '      <a class="jubao">举报</a>' : "") +
				'                            <span>' + dat.create_at + '</span>' +
				(this.isAdmin >= 0 ? '        <a class="zan" onclick="javascript:;"><b>(+' + dat.good + ')</b></a>' : "") +
				(this.isAdmin >= 0 ? '      <a class="re_ta" href="javascript:;;">回复Ta</a>' : "") +
				'                        </p>' +
				'                    </div>' +
				'                </div>' +
				'            </li>').attr('id', 'l_id_' + dat.fbid).appendTo(_target);

			var self = this;
			var c_Content = obj.find(".content");
			self.recordToObject(c_Content, dat);
			if (this.isAdmin >= 2) {
				$("<a href=\"javascript:;\" title=\"被移除后，其他用户会默认不显示该评论\" class=\"no hidefb\">移除该评论</a>").prependTo(obj.find(".info p")).click(function() {
					var obj = this;
					new MessageBox().show(this, '确认删除此内容?', 'button', function(mobj) {
						adDropFB(obj, mobj, self.id, self.type, dat.fbid);
					});
					return false;
				});
			}
			if (self.isAdmin >= 1) {
				var btn_hidefb = $("<a href=\"javascript:;\" title=\"被隐藏后，其他用户会默认不显示该评论\" class=\"no hidefb\">" + (self.isAdmin >= 2 ? "删除" : "隐藏") + "该评论</a>").prependTo(obj.find(".info p")).click(function() {
					var obj = this;
					adHideFB(obj, self.id, self.type, dat.fbid);
					return false;
				});
				var btn_showfb = $("<a href=\"javascript:;\" class=\"yes showfb\">显示该评论</a>").prependTo(obj.find(".info p")).click(function() {
					var obj = this;
					adShowFB(obj, self.id, self.type, dat.fbid);
					return false;
				});
				if (dat.ad_check == 0) {
					btn_showfb.hide();
				} else {
					btn_hidefb.hide();
				}
			}
			if (self.isAdmin >= 0) {
				obj.find(".jubao").click(function() {
					var obj = this;
					return reportFB(obj, self.id, self.type, dat.fbid);
				});
				obj.find(".zan").click(function() {
					return agFB(this, self.id, self.type, dat.fbid);
				});
			}
			self.pushUser(dat.mid, obj);
			obj.find('.re_ta').click(function() {
                self.re_send_show($(this).parents(".reply").find(".re_send"), $(this).parents(".re_cnt").find(".name").html(), dat.fbid, rootFbid);
            });
			return obj;
		},
		loadReply: function(pgBox, target, fbid, page) {
			if (typeof(page) === "undefined") page = 1;
			var self = this;
			$.ajax({
				dataType: "json",
				url: "http://api.bilibili.com/feedback?type=jsonp&ver=3&callback=?&mode=" + self.type + "&" + self.id_name + "=" + this.id + "&replyID=" + fbid + "&pagesize=10&page=" + page + "&sid="+__GetCookie("sid"),
				success: function(data) {
					$(target).empty();
					$(pgBox).empty().attr({
						'data-page': page,
						'data-results': data.results
					});
					pagelist(pgBox, page, data.pages, data.results, function(_page) {
						self.loadReply(pgBox, target, fbid, _page);
					}, "评论", self.platform == "mobile" ? 1 : 2, true);
					for (var i = 0; i < data.list.length; i++) {
						self.reply_render(data.list[i], fbid, target);
					}
					self.checkFeed(self.id);
					if(self.platform == "pc") {
						bindCardEvent(target);
					}
					if ($(target).height() > $(window).height()) {
						$(document).scrollTop($(target).offset().top - 5);
					} else {
						$(document).scrollTop($(target).offset().top - ($(window).height() - $(target).height()) / 2);
					}

					if(self.options.useIframe) {
						setParentHeight();
					}

					self._trigger('onReplyLoad');
				}
			});
		},
		submitFeedback: function(btn, _target, reply, callback) {
			if ('请在这里输入您要发表的评论信息' == $('#comment_text', _target).val()) {
				$('#comment_text', _target).focus();
				return false;
			}

			if ($('#comment_text', _target).val().length > 1000 || $('#comment_text', _target).val().length < 4) {
				new MessageBox().show(btn, '评论字数必须在4到1000个之间！', 3000, 'error');
				$('#comment_text', _target).focus();
				return false;
			}

			var self = this,
				quoteID,
				rootQuoteID;
			if(reply !== false) {
				quoteID = this._quoteID;
				rootQuoteID = this._rootQuoteID;
			}
			var reqData = {
				msg: $('#comment_text', _target).val().replace(/%/g, "%25"),
				action: 'send',
				quoteID: quoteID,
				root_quoteID: rootQuoteID
			};

			if (this.type == 'arc') {
				reqData.aid = this.id;
			} else if (this.type == 'topic') {
				reqData.tp_id = this.id;
			} else {
				reqData.news_id = this.id;
			}

			if ($("#fb_vcode", _target).length > 0) {
				reqData.vcode = $("#fb_vcode", _target).val();
			}

			$.ajax({
				url: "http://interface.bilibili.com/feedback/post?callback=?",
				type: "get",
				dataType: "jsonp",
				data: reqData,
				success: function(data) {
					if (data == "OK") {
						$('#comment_text', _target).val('');
						new MessageBox().show(btn, '发送成功', 2000);
						if (self.page == 1 && self.orderby == 'default' && !quoteID && typeof(callback) != "function") {
							setTimeout(function() {
								self.show(self.id, 1);
							}, 200);
						}
						if (quoteID) {
							var replyContainer = _target.parent(),
								replyList = replyContainer.find('.re_ul'),
								pgBox = replyContainer.find('.pagelistbox'),
								page = parseInt(pgBox.attr('data-page')),
								results = parseInt(pgBox.attr('data-results')) || replyList.children().length;
							if (!replyContainer.find('.re_more').length && !page || page == Math.ceil((results) / 10)) {
								setTimeout(function() {
									self.loadReply(pgBox, replyList, rootQuoteID || quoteID, Math.ceil((results + 1) / 10));
								}, 200);
							}
						}

						self._trigger('onSubmit');
					} else {
						new MessageBox().show(btn, data, 3000, 'error');
					}
				},
				error: function() {
					new MessageBox().show(btn, "发送失败", 2000, 'error');
				}
			});
		},
		re_send_show: function(obj, target, rp_quoteID, root_quoteID, callback) {
			var self = this;
			var re_send = obj;
			var reply = re_send.parents(".reply");

			this.setQuoteID(rp_quoteID, root_quoteID);

			if (re_send.children().length == 0) {
				$(".reply", self.target).each(function(index, el) {
					var el = $(el);
					if (el.css("display") == "block" && el.find(".re_ul").children().length == 0 && el[0] != re_send.parent()[0]) {
						el.hide();
					} else if (el[0] == re_send.parent()[0]) {
						el.show();
					}
				});
				$(".re_send", self.target).hide();
				$(".re_send", self.target).children().remove();
				var inpt_txt = $(".comm_send", self.target).html();
				re_send.append(inpt_txt);
				$("._qure .t", re_send).html("");
				self.checkLogin(re_send);
				re_send.find(".ywz").removeClass("open");
				re_send.find(".biaoqing_box").removeClass("open");
				re_send.show();

				this.initEmoji(re_send);

				re_send.find(".ipt-txt").val('');
				if (target != null) {
					insertAtCursor($(".ipt-txt", re_send).get(0), "回复 @" + target + " :");
				}
			} else if (target != null) {
				re_send.show();
				re_send.find(".ipt-txt").val('');
				insertAtCursor($(".ipt-txt", re_send).get(0), "回复 @" + target + " :");
			} else if (re_send.find(".ipt-txt").val() == "" || re_send.parent().hasClass("empty")) {
				var empty = reply.find(".re_ul").children().length == 0 ? true : false;
				if (re_send.css("display") != "none") {
					re_send.hide();
					if (empty) {
						reply.hide();
					}
				} else {
					re_send.show();
					if (empty) {
						reply.show();
					}
				}
			} else {
				re_send.find(".ipt-txt").val("");
			}

			$("button[type=submit]", re_send).off('click.submit').on('click.submit', function() {
				if (!self.loginInfo.isLogin || !UserStatus.checkMoral()) {
					return;
				}
				return self.submitFeedback(this, re_send, true, callback);
			});

			re_send.find(".ipt-txt").focus();
		},
		show: function(id, page, replyID, callback) {
			if (typeof(page) === "undefined") page = 1;
			if (typeof replyID == 'function') {
				callback = replyID;
				replyID = null;
			}
			this.page = page;
			this.id = id;
			var self = this,
				reqData = {
					page: page,
					mode: this.type,
					type: 'jsonp',
					ver: 3
				},
				id_name = "aid";

			switch (this.type) {
				case "topic":
					id_name = "tp_id";
					break;
				case "news":
					id_name = "news_id";
					break;
			}
			this.id_name = id_name;
			reqData[id_name] = id;
			if (this.orderby) {
				reqData.order = this.orderby;
			}
			if (replyID) {
				reqData.jumpID = replyID;
			}
			reqData.sid = __GetCookie("sid");

			this.tempComment = $(".comm_send #comment_text").val();

			$.ajax({
				dataType: "jsonp",
				url: "http://api.bilibili.com/feedback",
				data: reqData,
				success: function(data) {
					var _target = self.target.show();
					_target.parent().find('#load_comment').remove();
					$(".common .b-head .results").html(data.results);
					if (data.code === -503) {
						var sav_pos = $(_target).css("position");
						$(_target).css("position", "relative");
						$("<div style=\"opacity: 0.3;z-index: 1000;background-color: #ccc;width: 100%;height: 100%;display: block;position: absolute;\"></div>").prependTo(_target);
						setTimeout(function() {
							$(_target).css("position", sav_pos);
							self.show(id, page);
						}, 2000);
						return;
					}
					if (typeof(data.list) != "object") return;

					if (replyID && data.page) {
						self.page = page = data.page;
					}

					self.isAdmin = data.isAdmin;
					$(_target).empty();
					if (self.type != "topic") {
						var c_ORDER = $('<div class="c_order"><ul class="b-slt-tab"><li order="default"><a>默认排序</a></li><li order="good"><a>按赞同数</a></li><li order="hot"><a>按回复数</a></li></ul></div>').appendTo(_target);
						$('li[order="' + self.orderby + '"]', c_ORDER).addClass("on");
						$("li", c_ORDER).click(function() {
							var btn = $(this);
							if (btn.hasClass("on")) return;
							$("li", c_ORDER).removeClass("on");
							btn.addClass("on");
							self.orderby = btn.attr("order");
							self.show(id, 1);
						});
					}
					var c_UL = $('<ul class="comm_list"></ul>').appendTo(_target);
					var c_PL = $("<div class=\"pagelistbox\"></div>").appendTo(_target);
					var c_PL_TOP = $("<div class=\"pagelistbox top\"></div>").insertBefore(c_UL);
					pagelist(c_PL, page, data.pages, data.results, function(_page) {
						self.show(id, _page);
						self._scrollToTop();
					}, "评论", self.platform == "mobile" ? 1 : 4, true);
					pagelist(c_PL_TOP, page, data.pages, data.results, function(_page) {
						self.show(id, _page);
					}, null, self.platform == "mobile" ? 1 : 2, true);
					if (data.results == 0) {
						$("<div class=\"no_more\">没有更多信息</div>").appendTo(_target);
					}
					for (var i in data.list) {
						if (typeof(data.list[i]) != "object") continue;
						(function(_r) {
							var li = $('<li id="l_id_' + _r.fbid + '">' +
								'<a href="http://space.bilibili.com/' + _r.mid + '" target="_blank" card="' + _r.nick + '"><div class="facebox r' + _r.rank + '"><img src="' + _r.face + '" class="face"><div class="face_bg"><div class="sign-bg"></div></div></div></a>' +
								'<div class="t"><span class="lnum">#' + _r.lv + '</span><a href="http://space.bilibili.com/' + _r.mid + '" target="_blank" card="' + _r.nick + '">' + _r.nick + '</a><a href="http://www.bilibili.com/html/help.html#k_3" target="_blank" class="user-info-level l' + (_r.level_info ? _r.level_info.current_level : 0) + '"></a></div>' +
								'<div class="content"></div><div class="elinfo">' + human_date(_r.create) + (_r.device && _r.device != 'Web' ? '<a class="ico ' + _r.device + '">' + (_r.device == "WP" ? "Windows Phone" : _r.device) + '</a>' : '') +
								'<i class="report"></i></div>' +
								'</li>').appendTo(c_UL);
							self.pushUser(_r.mid, li);

							var c_Content = li.find(".content");
							self.recordToObject(c_Content, _r);
							if (_r.quote != null) {
								var c_Quote = $("<div class=\"quote\"><div class=\"t\">#" + _r.quote.lv + "<a href=\"http://space.bilibili.com/" + _r.quote.mid + "\" target=\"_blank\" card=\"" + _r.quote.nick + "\">" + _r.quote.nick + "</a></div>" +
									"<div class=\"content\"></div>" +
									"</div>").prependTo(c_Content);
								var c_QuoteContent = c_Quote.find(".content");
								self.recordToObject(c_QuoteContent, _r.quote);
							}
							if (_r.reply != null) {
								var c_reply = $('<div class="reply"><ul class="re_ul"></ul>' +
									'<div class="re_box">' +
									'	<p class="j_re"><a class="re_send_s" href="javascript:;">参与回复</a></p>' +
									(_r.reply_count > 5 ? '<p class="re_more"><span>还有<b> ' + (_r.reply_count - 5) + ' </b>条回复 </span><a class="re_more_s">点击查看</a></p>' : "") +
									'<div class="re_page">' +
									'	<div class="pagelistbox">' +
									'	</div>' +
									'</div>' +
									'</div>' +
									'<div class="re_send"></div>' +
									'</div>').appendTo(li);

								$(".re_send_s", c_reply).click(function() {
									self.re_send_show($(this).parents(".reply").find(".re_send"), null, _r.fbid);
								});
								var re_ul = $(".re_ul", c_reply),
									re_page = 1;
								for (var i = 0; i < _r.reply.length; i++) {
									self.reply_render(_r.reply[i], _r.fbid, re_ul);
									if(replyID && _r.reply[i].fbid == replyID && data.rt_page) {
										re_page = data.rt_page;
									}
								}
								$(".re_more_s", c_reply).click(function() {
									$(".re_more", c_reply).remove();
									self.loadReply($(".pagelistbox", c_reply), re_ul, _r.fbid, re_page);
								});
							}

							var _rpt_btn = li.find(".report");
							if (self.isAdmin >= 2) {
								$("<a href=\"javascript:;\" title=\"被移除后，其他用户会默认不显示该评论\" class=\"no hidefb\">移除该评论</a>").prependTo(_rpt_btn).click(function() {
									var obj = this;
									new MessageBox().show(this, '确认删除此内容?', 'button', function(mobj) {
										adDropFB(obj, mobj, id, self.type, _r.fbid);
									});
									return false;
								});
							}
							if (self.isAdmin >= 1) {
								var btn_hidefb = $("<a href=\"javascript:;\" title=\"被隐藏后，其他用户会默认不显示该评论\" class=\"no hidefb\">" + (self.isAdmin >= 2 ? "删除" : "隐藏") + "该评论</a>").prependTo(_rpt_btn).click(function() {
									var obj = this;
									adHideFB(obj, id, self.type, _r.fbid);
									return false;
								});
								var btn_showfb = $("<a href=\"javascript:;\" class=\"yes showfb\">显示该评论</a>").prependTo(_rpt_btn).click(function() {
									var obj = this;
									adShowFB(obj, id, self.type, _r.fbid);
									return false;
								});
								if (_r.ad_check == 0) {
									btn_showfb.hide();
								} else {
									btn_hidefb.hide();
								}
							}
							if (self.isAdmin >= 0) {
								$("<a class=\"jubao\">举报</a>").appendTo(_rpt_btn).click(function() {
									return reportFB(this, self.id, self.type, _r.fbid);
								});
								$("<a href=\"javascript:;\" class=\"zan\"><b>(+" + _r.good + ")</b></a>").appendTo(_rpt_btn).click(function() {
									return agFB(this, id, self.type, _r.fbid);
								});
								// $("<a href=\"javascript:;\" class=\"no\">反对<b>(+"+_r.bad+")</b></a>").appendTo(_rpt_btn).click(function(){
								// return dagFB(this,id,self.type,_r.fbid);
								// });
							}
							var c_reply_new, re_ul_new;
							$("<a href=\"javascript:;\" class=\"huifu\">回复</a>").appendTo(_rpt_btn).click(function() {
								if (li.find(".reply").length == 0) {
									c_reply_new = $('<div class="reply"><ul class="re_ul"></ul><div class="re_box">' +
										'<p class="j_re"><a class="re_send_s" href="javascript:;">参与回复</a></p><div class="re_page">	<div class="pagelistbox">' +
										'</div></div></div><div class="re_send"></div></div>').appendTo(li);
									$(".re_box", c_reply_new).hide();
									$(".re_send_s", c_reply_new).click(function() {
										self.re_send_show(c_reply_new.find(".re_send"), null, _r.fbid);
									});
								} else {
									c_reply_new = li.find(".reply");
								}
								
								re_ul_new = c_reply_new.find(".re_ul");

								self.re_send_show(c_reply_new.find(".re_send"), null, _r.fbid);
							});
						})(data.list[i]);
					}
					self.checkFeed(self.id);
					var c_CommSend = $("<div class=\"comm_send\"></div>").prependTo(_target);
					if (self.isAdmin >= -1) {
						var is_login = self.loginInfo && self.loginInfo.isLogin;
						var c_TG = $('<div class="tg_send_post">'+
							'<div class="dcmp_content"><div class="user_face"><img src="' + (is_login ? window.biliLoginStatus.face.replace("_s", "") : "") + '"></div><div id="dcmp_textarea_container"><div class="dcmp_title"><small id="ajaxBackMsg">请自觉遵守互联网相关的政策法规，严禁发布色情、暴力、反动的言论。</small></div><textarea cols="80" name="msg" rows="5" id="comment_text"  placeholder="在这里输入评论" class="ipt-txt"></textarea>' +
							'<div class="dcmp_post">' +
								'<div class="ywz-wrapper">' +
								'<div class="biaoqing_box"><a>(⌒▽⌒)</a><a>（￣▽￣）</a><a>(=・ω・=)</a><a>(｀・ω・´)</a><a>(〜￣△￣)〜</a><a>(･∀･)</a><a>(°∀°)ﾉ</a><a>(￣3￣)</a><a>╮(￣▽￣)╭</a><a>( ´_ゝ｀)</a><a>←_←</a><a>→_→</a><a>(&lt;_&lt;)</a><a>(&gt;_&gt;)</a><a>(;¬_¬)</a><a>("▔□▔)/</a><a>(ﾟДﾟ≡ﾟдﾟ)!?</a><a>Σ(ﾟдﾟ;)</a><a>Σ( ￣□￣||)</a><a>(´；ω；`)</a><a>（/TДT)/</a><a>(^・ω・^ )</a><a>(｡･ω･｡)</a><a>(●￣(ｴ)￣●)</a><a>ε=ε=(ノ≧∇≦)ノ</a><a>(´･_･`)</a><a>(-_-#)</a><a>（￣へ￣）</a><a>(￣ε(#￣) Σ</a><a>ヽ(`Д´)ﾉ</a><a>(╯°口°)╯(┴—┴</a><a>（\#-_-)\┯━┯</a><a>_(:3」∠)_</a><a>(笑)</a><a>(汗)</a><a>(泣)</a><a>(苦笑)</a></div>' +
								'<a class="ywz"></a>' +
								'</div>' +
								'<div class="dcmp_userinfo"><div class="_qure"><div class="t"></div></div></div></div>' +
								'<div id="textarea_size_tester"></div>' +
							'</div>' +
							'</div>' +
						'</div>').appendTo(c_CommSend);
						if (self.tempComment) {
							c_CommSend.find('#comment_text').val(self.tempComment);
						}
						if (data.needCode) {
							$('验证码︰<input type="text" id="fb_vcode" value="" size="6" /><img src="/captcha" onclick="this.src=\'/captcha?r=\'+Math.random()" />').appendTo(c_TG.find(".dcmp_post .dcmp_userinfo"));
						}
						var submit_btn = $('<button type="submit" class="pink b-btn">发表评论</button>').appendTo(c_TG.find(".dcmp_post .dcmp_userinfo"));
						self.checkLogin(c_TG);
						submit_btn.click(function() {
							if (!self.loginInfo.isLogin || !UserStatus.checkMoral()) {
								return;
							}
							self.submitFeedback(this, c_CommSend, false);
						});

						self.initEmoji(c_CommSend);

						var ac = {
							source: function(request, response) {
								if (!(m = request.term.match(/@([^\s]+)$/))) {
									return false;
								}
								var term = m[1];

								$.getJSON("http://interface.bilibili.com/m/friend_suggest?jsoncallback=?", {
									term: term.replace(/　/g, ""),
									rnd: Math.random()
								}, response);
							},
							search: function() {
								// custom minLength
								if (!(m = this.value.match(/@([^\s]+)$/))) {
									return false;
								}
								var term = m[1];
								if (term.charCodeAt(0) < 255 && term.length < 1 || term.length > 10) {
									return false;
								}
							},
							focus: function() {
								// prevent value inserted on focus
								return false;
							},
							select: function(event, ui) {
								this.value = this.value.replace(/@([^\s]*)$/, '@' + ui.item.value);
								return false;
							},
							appendTo: "#dcmp_textarea_container",
							position: {
								my: "left top",
								using: function() {
									$(this).css("top", $("#textarea_size_tester").outerHeight());
									$(this).css("left", $("#textarea_size_tester").outerWidth() % $("#dcmp_textarea_container").outerWidth());
								}
							}
						};
						if ($(".ipt-txt", c_CommSend).length > 0) {
							$(".ipt-txt", c_CommSend).bind('keyup', function(event) {
								if (m = this.value.match(/@([^\s]*)$/)) {
									$(".ipt-txt", c_CommSend).autocomplete(ac)
										.data("autocomplete")._renderItem = function(ul, item) {
											return $("<li></li>")
												.data("item.autocomplete", item)
												.append("<a style=\"text-align:left\"><img src=\"" + item.face + "\" style=\"border: none;height:20px;width: 20px;vertical-align: bottom;padding-right: 5px;}\" />" + item.value + "</a>")
												.appendTo(ul);
										};

									$("#textarea_size_tester", c_CommSend).get(0).innerText = this.value.substr(0, this.value.length - m[1].length);
								} else {
									$(".ipt-txt", c_CommSend).autocomplete("destroy");
								}
							});
						}
					} else {
						$("<a style=\"cursor:help\"><img src=\"http://static.hdslb.com/images/nologininfo.gif\" /></a>").appendTo(c_CommSend).click(function() {
							goTop();
							return false;
						});
					}
					if(self.platform == "pc") {
						bindCardEvent(_target);
					}
					if (typeof(callback) == "function") {
						callback(_target);
					}

					if(self.options.useIframe) {
						setParentHeight();
					}

					self._trigger('onLoad');
				}
			});
		},

		setQuoteID: function(quoteID, rootQuoteID) {
			this._quoteID = quoteID || undefined;
			this._rootQuoteID = rootQuoteID || undefined;
		},

		_scrollToTop: function() {
			$(this.bindWindow).scrollTop($(this.bindTarget).offset().top);
		},

		_trigger: function() {
            var args = Array.prototype.slice.call(arguments, 0);
            var handler = args.shift();
            if (this.options[handler]) {
                return this.options[handler].apply(this, args);
            }
        }
	};

	return bbFeedback;
})();

function resetAttentionCache() {
	CacheManager.reset('AttentionList');
}

var CacheManager = {
	map: {
		'biliLoginStatus': 1,
		'AttentionList': 2,
		'last_fav': 4,
		'BangumiFavList': 5
	},
	register: function(key, index) {
		this.map[key] = index;
	},
	reset: function(key) {
		if (this.getItem(key) && window.sessionStorage && window.sessionStorage.bili_login_status) {
			var index = this.map[key];
			var cache = JSON.parse(window.sessionStorage.bili_login_status);
			cache[index] = this.getItem(key);
			window.sessionStorage.bili_login_status = JSON.stringify(cache);
		}
	},
	getItem: function(key) {
		return window[key];
	},
	removeItem: function(key, value) {
		if (this.getItem(key)) {
			var pos = $.inArray(value, this.getItem(key));
			if (pos >= 0) {
				this.getItem(key).splice(pos, 1);
				this.reset(key);
			}
		}
	},
	addItem: function(key, value) {
		if (this.getItem(key)) {
			this.getItem(key).unshift(value);
			this.reset(key);
		}
	}
};

function attentionUser(obj, uid, callback) {
	if (!UserStatus.isLogin(obj)) {
		return false;
	}
	Bilibili.attentionUser(obj, uid, function(data) {
		if (data.code == 0) {
			window.AttentionList.push(uid);
			resetAttentionCache();
			new MessageBox().show(obj, '关注成功!', 1000, 'ok');
			if (typeof callback != "undefined") {
				callback(data);
			}
		} else {
			new MessageBox().show(obj, data.msg, 2000, "warning");
		}
	});
}

function unattentionUser(obj, uid, callback) {
	if (!UserStatus.isLogin(obj)) {
		return false;
	}
	Bilibili.delFriend(obj, uid, function(data) {
		if (data.code == 0) {
			var index = window.AttentionList.indexOf(uid);
			if (index != -1) {
				window.AttentionList.splice(index, 1);
				resetAttentionCache();
			}
			new MessageBox().show(obj, '取消关注成功!', 1000, 'ok');
			if (typeof callback != "undefined") {
				callback(data);
			}
		} else {
			new MessageBox().show(obj, data.msg, 2000, "warning");
		}
	});
}

function showSpAdbtn(isSpFav, spid, seasonId) {
	var btn;
	spid = spid !== undefined ? spid : window.spid;
	if(!spid && !seasonId) {
		return;
	}
	if (isSpFav == "1") {
		btn = $('<p class="b-btn w">已订阅</p>').on('click', function() {
			if(seasonId !== undefined) {
				Subscribe.bangumi(this, seasonId, false, function() {
					showSpAdbtn("0", spid, seasonId);
				});
			} else {
				Subscribe.sp(this, spid, false, function() {
					showSpAdbtn("0", spid, seasonId);
				});
			}
		});
		btn.hover(
			function() {
				btn.html("取消订阅");
			},
			function() {
				btn.html("已订阅");
			}
		);

	} else {
		btn = $('<p class="b-btn dy">订阅</p>').on('click', function() {
			if(seasonId !== undefined) {
				Subscribe.bangumi(this, seasonId, true, function() {
					showSpAdbtn("1", spid, seasonId);
				});
			} else {
				Subscribe.sp(this, spid, true, function() {
					showSpAdbtn("1", spid, seasonId);
				});
			}
		});
	}
	$("#sp_dingyue").empty().append(btn);
}

var Subscribe = {
	sp: function(btn, spId, toggle, callback) {
		this._toggle('sp', btn, spId, toggle, callback);
	},
	bangumi: function(btn, seasonId, toggle, callback) {
		this._toggle('bangumi', btn, seasonId, toggle, callback);
	},
	
	_toggle: function(mode, btn, id, toggle, callback) {
		if(!UserStatus.isLogin(btn)) {
			return;
		}
		var xhr,
			self = this;
		if(mode=='bangumi') {
			xhr = $.get('/api_proxy?app=bangumi', {
				action: toggle ? 'concern_season' : 'unconcern_season',
				season_id: id
			}, function(res) {
				if (res.code == 0) {
					if(toggle) {
						CacheManager.addItem('BangumiFavList', id.toString());
					} else {
						CacheManager.removeItem('BangumiFavList', id.toString());
					}
					self._success(btn, toggle, res, callback);
				} else {
					self._fail();
				}
			});
		} else {
			xhr = $.get('/spadmin', {
				action: toggle ? 'attention' : 'unfavourite',
				spid: id
			}, function(res) {
				if (res == "OK") {
					if(toggle) {
						CacheManager.addItem('AttentionList', -id);
					} else {
						CacheManager.removeItem('AttentionList', -id);
					}
					self._success(btn, toggle, res, callback);
				} else{
					self._fail();
				}
			})
		}
		xhr.fail(function() {
			self._fail();
		});
	},
	_success: function(btn, toggle, res, callback) {
		if(toggle) {
			new MessageBox().show(btn, '订阅成功!', 1000);
		} else {
			new MessageBox().show(btn, '取消订阅成功!', 1000);
		}
		if (typeof callback != "undefined") {
			callback(res);
		}
	},
	_fail: function() {
		new MessageBox().show(btn, '请求发生错误(´・ω・｀)', 1500, 'error');
	}
};

function postJSON(options) {
	var msgbox = new MessageBox();
	var callback = options.callback || "_jsonpCallback_" + (new Date().getTime());
	var objIFrame = $("<iframe name=\"frm" + callback + "\" id=\"frm" + callback + "\" style=\"visibility:hidden; width:1px; height:1px\"></iframe>").appendTo("body");
	var objForm = $("<form action=\"" + options.url + "\" method=\"POST\" target=\"frm" + callback + "\"></form>").appendTo("body");
	if (typeof(options.data) == "undefined") options.data = {};
	options.data[options.jsonpCallback || "callback"] = callback;
	for (var i in options.data) {
		$("<input type=\"hidden\" name=\"" + i + "\" />").appendTo(objForm).val(options.data[i]);
	}
	window[callback] = function(data) {
		if (typeof(options.success) == "function") {
			options.success(data);
		}
		objIFrame.remove();
		objForm.remove();
	}
	objForm.submit();
}

var Bilibili = {
	initCrossdomain: function() {
		if (window.location.href.match(/\.bilibili\.tv/)) {
			Bilibili.interface_domain = "interface.bilibili.tv";
			document.domain = "bilibili.tv";
		} else if (window.location.href.match(/\.bilibili\.com/)) {
			Bilibili.interface_domain = "interface.bilibili.com";
			document.domain = "bilibili.com";
		} else {
			Bilibili.interface_domain = "interface.bilibili.cn";
			document.domain = "bilibili.cn";
		}
	},
	badlistUser: function(obj, uid, callback) {
		Bilibili.initCrossdomain();
		if (typeof(uid) == "function") {
			callback = uid;
			uid = obj;
			obj = null;
		} else if (typeof(uid) == "undefined") {
			uid = obj;
			obj = null;
		}
		postJSON({
			url: "http://" + Bilibili.interface_domain + "/m/friend_manage.do",
			data: {
				act: "add_badlist",
				format: "json",
				uid: uid
			},
			success: function(data) {
				if (typeof(callback) == "undefined") {
					if (data.code == 0) {
						new MessageBox().show(obj, '黑名单成功!', 1000, 'ok');
					} else {
						new MessageBox().show(obj, data.msg, 2000, "warning");
					}
				} else {
					callback(data);
				}
			}
		});
	},
	attentionUser: function(obj, uid, callback) {
		Bilibili.initCrossdomain();
		if (typeof(uid) == "function") {
			callback = uid;
			uid = obj;
			obj = null;
		} else if (typeof(uid) == "undefined") {
			uid = obj;
			obj = null;
		}
		postJSON({
			url: "http://" + Bilibili.interface_domain + "/m/friend_manage.do",
			data: {
				act: "add",
				attention: 1,
				format: "json",
				uid: uid
			},
			success: function(data) {
				if (typeof(callback) == "undefined") {
					if (data.code == 0) {
						new MessageBox().show(obj, '关注成功!', 1000, 'ok');
					} else {
						new MessageBox().show(obj, data.msg, 2000, "warning");
					}
				} else {
					callback(data);
				}
			}
		});
	},
	whisperUser: function(obj, uid, callback) {
		Bilibili.initCrossdomain();
		if (typeof(uid) == "function") {
			callback = uid;
			uid = obj;
			obj = null;
		} else if (typeof(uid) == "undefined") {
			uid = obj;
			obj = null;
		}
		postJSON({
			url: "http://" + Bilibili.interface_domain + "/m/friend_manage.do",
			data: {
				act: "add",
				attention: 0,
				format: "json",
				uid: uid
			},
			success: function(data) {
				if (typeof(callback) == "undefined") {
					if (data.code == 0) {
						new MessageBox().show(obj, '关注成功!', 1000, 'ok');
					} else {
						new MessageBox().show(obj, data.msg, 2000, "warning");
					}
				} else {
					callback(data);
				}
			}
		});
	},
	delFriend: function(obj, uid, callback) {
		Bilibili.initCrossdomain();
		if (typeof(uid) == "function") {
			callback = uid;
			uid = obj;
			obj = null;
		} else if (typeof(uid) == "undefined") {
			uid = obj;
			obj = null;
		}
		postJSON({
			url: "http://" + Bilibili.interface_domain + "/m/friend_manage.do",
			data: {
				act: "del",
				attention: 0,
				format: "json",
				uid: uid
			},
			success: function(data) {
				if (typeof(callback) == "undefined") {
					if (data.code == 0) {
						new MessageBox().show(obj, '删除成功!', 1000, 'ok');
					} else {
						new MessageBox().show(obj, data.msg, 2000, "warning");
					}
				} else {
					callback(data);
				}
			}
		});
	},
	delFans: function(obj, uid, callback) {
		Bilibili.initCrossdomain();
		if (typeof(uid) == "function") {
			callback = uid;
			uid = obj;
			obj = null;
		} else if (typeof(uid) == "undefined") {
			uid = obj;
			obj = null;
		}
		postJSON({
			url: "http://" + Bilibili.interface_domain + "/m/friend_manage.do",
			data: {
				act: "delFans",
				attention: 0,
				format: "json",
				uid: uid
			},
			success: function(data) {
				if (typeof(callback) == "undefined") {
					if (data.code == 0) {
						new MessageBox().show(obj, '删除成功!', 1000, 'ok');
					} else {
						new MessageBox().show(obj, data.msg, 2000, "warning");
					}
				} else {
					callback(data);
				}
			}
		});
	}
};

function sendCommand(obj, confirm_msg, url, data, msg) {
	var succ_msg = msg || "命令执行成功";
	return new MessageBox().show(obj, confirm_msg, 'button', function(mobj) {
		$.ajax({
			url: url,
			data: data,
			type: "POST",
			dataType: "html",
			success: function(data) {
				(new MessageBox()).show(obj, data == "OK" ? succ_msg : data, data == "OK" ? 500 : 2000, data == "OK" ? "info" : "warning");
			},
			error: function() {
				new MessageBox({
					Overlap: true,
					position: mobj.position
				}).show(obj, '提交失败，可能权限不足', 2000, 'error');
			}
		});
	});
}

/**
 * 用户信息卡
 */
var UserCard = (function() {
	var evCardTimer = null,
		tmrCardError = null,
		card_obj = null,
		$card,
		dataCache = {},
		_focus = false;

	function initCardEvent() {
		if (card_obj.attr("direction") == "top") {
			$card.css("top", card_obj.offset().top - $card.outerHeight() + 40 + "px");
			$card.find("> .arrow").addClass("arrow_t");
		} else {
			$card.css("top", card_obj.offset().top + card_obj.outerHeight() / 2 - 20 + "px");
		}
		if (card_obj.offset().left + $(".a_layer").outerWidth() + card_obj.width() + 5 > $(window).width()) {
			$card.css("left", card_obj.offset().left - 5 - $(".a_layer").outerWidth() + "px");
			$card.find("> .arrow").removeClass("arrow_l");
			$card.find("> .arrow").addClass("arrow_r");
		} else {
			$card.css("left", card_obj.offset().left + card_obj.width() + 5 + "px");
		}
		$card.mouseenter(function() {
			clearTimeout(evCardTimer);
		});
		$card.mouseleave(cardEventOut);
	}

	function showCardMsg(msg) {
		clearTimeout(tmrCardError);
		if (!_focus) {
			return;
		}
		$('.a_layer').remove();
		$card = $('<div class="a_layer"><div class="content"><div class="bg_top"></div><div class="msg">' + msg + '</div></div><div class="arrow arrow_l"></div></div>').appendTo("body");
		initCardEvent();
	}

	function ShowCard(obj) {
		clearTimeout(tmrCardError);
		if (_focus && typeof obj.mid == "undefined") {
			showCardMsg("抱歉，该昵称目前不存在哦(*^__^*)");
			return;
		} else if (!_focus) {
			dataCache[obj['name']] = obj;
			return;
		} else {
			dataCache[obj['name']] = obj;
		}
		$('.a_layer').remove();

		$card = $('<div class="a_layer"><div class="content"><div class="bg_top"></div><div class="wrp"><div class="card">' +
			'<a href="http://space.bilibili.com/' + obj.mid + '" target="_blank"><img src="' + obj.face + '" class="face"></a><div class="info"><div class="t">' +
			'<a href="http://space.bilibili.com/' + obj.mid + '" target="_blank">' + obj["name"] + '</a>' +
			'<a href="http://www.bilibili.com/html/help.html#k_4" target="_blank" class="user-info-level border l' + obj.level_info.current_level + '"></a>' +
			(obj.approve ? '<a href="http://www.bilibili.com/html/certified.html" target="_blank" title="哔哩哔哩认证" class="verified"></a>' : '') +
			'</div><div class="address">' +
			'<i class="small_icon ' + (obj.sex == '男' ? 'male' : (obj.sex == '女' ? 'female' : '')) + '" title="' + obj.sex + '" ' +
			'></i><span> ' + (obj.place ? obj.place : "未知") + '</span><a href="http://message.bilibili.com/#whisper/mid' + obj.mid + '" target="_blank">电波</a></div></div>' +
			'<div class="W_addbtn_even"></div></div>' +
			'<div class="cardinfo">' + (obj.approve ? '<div class="approve">认证资料</div>' : "") + obj.description + '</div>' +
			'<ul class="userdata"><li><p class="t"><a href="http://space.bilibili.com/' + obj.mid +
			'/follow.html" target="_blank">关注</a></p><p class="num"><a href="http://space.bilibili.com/' + obj.mid + '/follow.html" target="_blank">' + obj.attention + '</a></p></li>' +
			'<li class="mid"><p class="t"><a href="http://space.bilibili.com/' + obj.mid + '/fans.html" target="_blank">粉丝</a></p>' +
			'<p class="num"><a href="http://space.bilibili.com/' + obj.mid + '/fans.html" target="_blank">' + obj.fans + '</a></p></li>' +
			'<li><p class="t"><a href="http://space.bilibili.com/' + obj.mid + '" target="_blank">投稿</a></p>' +
			'<p class="num"><a href="http://space.bilibili.com/' + obj.mid + '" target="_blank">' + obj.article + '</a></p></li></ul></div>' +
			'</div><div class="arrow arrow_l"></div></div>').appendTo("body");
		$card.find('.W_addbtn_even').append(_renderAttentionState(obj));
		initCardEvent();
	}

	function _renderAttentionState(obj) {
		var attention_me = false,
			follow_him = false,
			atthtml,
			callback = function() {
				$card.find('.W_addbtn_even').html(_renderAttentionState(obj));
			};

		if (typeof window.AttentionList != "undefined" && typeof window.AttentionList != "null") {
			for (var i = 0; i < window.AttentionList.length; i++) {
				if (window.AttentionList[i] == obj.mid) {
					follow_him = true;
					break;
				}
			}
		}
		if (typeof obj.attentions != "undefined" && typeof obj.attentions != "null") {
			for (var j = 0; j < obj.attentions.length; j++) {
				if (obj.attentions[j] == window.uid) {
					attention_me = true;
					break;
				}
			}
		}
		if (follow_him && attention_me) {
			atthtml = $('<i class="icon_add addbtn_b" title="加关注"></i>互相关注<span class="line">|</span><a href="javascript:;">取消</a>');
			atthtml.filter('a').on('click', function() {
				unattentionUser(this, obj.mid, callback);
			});
		} else if (!follow_him) {
			atthtml = $('<a href="javascript:;"><i class="icon_add addbtn_a" title="加关注"></i>关注</a>');
			atthtml.filter('a').on('click', function() {
				attentionUser(this, obj.mid, callback);
			});
		} else if (!attention_me) {
			atthtml = $('<i class="icon_add addbtn_c" title="已关注"></i>已关注<span class="line">|</span><a href="javascript:;">取消</a>');
			atthtml.filter('a').on('click', function() {
				unattentionUser(this, obj.mid, callback);
			});
		}
		return atthtml;
	}

	function showLoadCardFail() {
		clearTimeout(tmrCardError);
		showCardMsg('<span class="loading">加载失败</span>');
	}

	function loadCard(obj, user) {
		card_obj = $(obj);
		clearTimeout(tmrCardError);
		tmrCardError = setTimeout(showLoadCardFail, 5000);
		showCardMsg('<span class="loading">正在加载中,请稍候..</span>');
		if (dataCache[user]) {
			ShowCard(dataCache[user]);
		} else {
			$.getScript(utils.protocolRelative('//interface.bilibili.com/card/' + user + '.js')).fail(function() {
				showLoadCardFail();
			});
		}
	}

	function cardEventOver(obj, user) {
		clearTimeout(evCardTimer);
		_focus = true;
		evCardTimer = setTimeout(function() {
			loadCard(obj, user);
		}, 300);
	}

	function cardEventOut() {
		clearTimeout(evCardTimer);
		_focus = false;
		evCardTimer = setTimeout(function() {
			$('.a_layer').remove();
		}, 100);
	}

	function bindCardEvent(ele) {
		if (typeof(ele) != "undefined") {
			$(ele).find('a[card]').mouseenter(function() {
				cardEventOver(this, $(this).attr('card'));
			}).mouseleave(cardEventOut);
		} else {
			$('a[card]').mouseenter(function() {
				cardEventOver(this, $(this).attr('card'));
			}).mouseleave(cardEventOut);
		}
	}

	window['ShowCard'] = ShowCard;
	window['bindCardEvent'] = bindCardEvent;

	return {
		show: ShowCard,
		bind: bindCardEvent
	};

})();

/**
 * 视频信息卡
 */
function bindPOCoins2($po, bindCoins) {
	var ind_n;
	if (typeof(bindCoins) === "undefined" || bindCoins !== false) {
		for (var ind_i = 0; ind_i < $po.length; ind_i++) {
			//$po[ind_i].id = "jq_po_"+ind_i;
			ind_n = parseInt($($po[ind_i]).attr('yb'));


			if (ind_n >= 200 && ind_n < 300)
				$($po[ind_i]).addClass("m200");
			if (ind_n >= 300)
				$($po[ind_i]).addClass("m300");

		}
	}
	var prefix = 'data-';

	function _getAttr(el, key) {
		if (el.attr(key) === undefined) {
			key = prefix + key;
		}
		return el.attr(key);
	}
	if ($.browser.msie) {
		$po.addClass('snti');
	}
	var mousein = 0,
		mouInterval,
		mouOutInterval,
		xhr;

	var setPos = function(ele, box) {
		var left = ele.offset().left,
			top = ele.offset().top - box.outerHeight() - 5;
		if (left > $(window).width() - box.outerWidth()) {
			left = $(window).width() - box.outerWidth();
		}
		box.css({
			left: left,
			top: top
		});
	};

	var showView = function(ele) {
		if (mousein != 1) {
			return;
		}
		$('.ov-box').remove();
		var box = $('<div class="ov-box" style="display: none;">' +
			'<div class="ov">' +
			'<div class="title"></div>' +
			'<div class="subtitle"></div>' +
			'<div class="info">' +
			/* 显示 "万" 单位 */
			'<i class="gk">' + formatFriendlyNumber(_getAttr(ele, 'gk')) + '</i>' +
			'<i class="sc">' + formatFriendlyNumber(_getAttr(ele, 'sc')) + '</i>' +
			'<i class="pl">' + formatFriendlyNumber(_getAttr(ele, 'pl')) + '</i>' +
			/* end */
			'<i class="pts">' + _getAttr(ele, 'yb') + '</i>' +
			'</div>' +
			'<img src="">' +
			'<p class="txt"></p>' +
			'<p class="lm"></p>' +
			'<p class="tg-date"></p>' +
			'</div>' +
			'</div>').prependTo('body');
		setPos(ele, box);
		box.find('.ov > .txt').html(_getAttr(ele, 'txt'));
		box.find('.ov > .title').html(_getAttr(ele, 'title') || ele.find('.t').html());
		box.find('.ov > .subtitle').html(_getAttr(ele, 'subtitle'));
		box.find('.ov > .tg-date').html(_getAttr(ele, 'tg'));
		box.find('.ov > .lm').html(_getAttr(ele, 'up'));
		box.find('.ov > img').attr('src', _getAttr(ele, 'pic') || ele.find('img').attr('src'));
		box.fadeIn(300);
		//box.mouseenter(function(){mousein = 1; clearTimeout(mouOutInterval); });
		//box.mouseleave(mouseOutFunc);
		clearTimeout(mouInterval);
	};

	var showViewByPng = function(ele, src) {
		$('#video_preview_pic').remove();
		var box = $('<div class="v-preview-pic" id="video_preview_pic"></div>').appendTo('body').hide(),
			img = $('<img />').appendTo(box);
		img.on('load', function() {
			setPos(ele, box);
			box.fadeIn(300);
		});
		img.attr('src', src);
		clearTimeout(mouInterval);
	};

	var mouseOutFunc = function() {
		mousein = 0;
		clearInterval(mouInterval);
		mouOutInterval = setTimeout(function() {
			if (mousein) return;
			clearTimeout(mouOutInterval);
			$('.ov-box, #video_preview_pic').remove();
		}, 100);
	};
	var mouseInFunc = function() {
		var ele = $(this);
		mousein = 1;
		mouInterval = setTimeout(function() {
			if(ele.attr('data-view') && ele.attr('data-view') != 'loaded') {
				showViewByPng(ele, '/widget/ajaxGetVideoInfo?aid=' + ele.attr('data-view'));
				return;
			} else {
				showView(ele);
			}
		}, 500);
	};
	$po.each(function(i, e) {
		var $e = $(e);
		if (_getAttr($e, 'gk') || $e.attr('data-view')) {
			$e.hover(
				mouseInFunc,
				mouseOutFunc
			);
			return;
		}
	});

}

window.loginCallbacks = [];

function onLoginInfoLoaded(fn, forceToPush) {
	if (typeof window.biliLoginStatus != "undefined") {
		fn(window.biliLoginStatus);
		if (forceToPush === true) {
			window.loginCallbacks.push(fn);
		}
	} else {
		window.loginCallbacks.push(fn);
	}
}

var UserStatus = (function() {
	return {
		callbacks: window['loginCallbacks'],
		status: function() {
			return window.biliLoginStatus;
		},
		isLogin: function(obj) {
			if (this.status() && this.status().isLogin) {
				return true;
			} else if (this.status() && typeof obj != 'undefined') {
				new MessageBox().show(obj, '请先<a href="https://account.bilibili.com/login" target="_blank">登录</a>', 1500, 'warning');
				return false;
			} else {
				return false;
			}
		},
		checkMoral: function() {
			if (this.status().moral != null && this.status().moral < 60) {
				return false;
			} else {
				return true;
			}
		},
		level: function() {
			return this.status().level_info ? this.status().level_info.current_level : null;
		},
		onLoaded: window['onLoginInfoLoaded']
	};
})();

function loadLoginInfo(info, by_cache) {
	window.biliLoginStatus = info;
	try {
		if (!by_cache && window.sessionStorage) {
			var cache_status = [new Date().getTime() + 120000];
			cache_status.push(info);
			cache_status.push(window.AttentionList);
			cache_status.push(window.uid);
			cache_status.push(window.last_fav);
			cache_status.push(window.BangumiFavList);
			window.sessionStorage.bili_login_status = JSON.stringify(cache_status);
		}
	} catch (err) {

	}
	for (var i = 0; i < loginCallbacks.length; i++) {
		loginCallbacks[i](info);
	}
}

function onLoginNavigator(info) {
	if (!$('.z_top').length) return;
	if (info.isLogin) {
		var dynNum = 0;
		for (var d in info.dynamic) {
			dynNum += parseInt(info.dynamic[d]);
		}
		info.dynTotalNum = dynNum;
		if (!$('#i_menu_community_msg_btn').length && $('#i_menu_msg_btn').length) {
			$('<li id="i_menu_community_msg_btn" guest="no" i_menu="community_msg" class="u-i">\
				<a class="i-link" href="http://message.bilibili.com" target="_blank">消息</a>\
			</li>').insertAfter('#i_menu_profile_btn');
		}
		$("li[guest=\"no\"]").show();
		$("li[guest=\"yes\"]").hide();
		$(".i_face").attr("src", info.face.replace('_s', '_m'));
		var menu = $("#i_menu_profile");
		$(".uname", menu).html('<b>' + info.uname + '</b>');
		$(".uname", menu).append('<a href="http://www.bilibili.com/html/help.html#k_1" target="_blank" class="user-info-level l' + (info.level_info ? info.level_info.current_level : 0) + '"></a>');
		$(".coin", menu).html('<b class="b-icon"></b>' + info.money);
		profileWnd(info);

		var totalDiv = $("#dynamic_num_total");
		if (dynNum > 0) totalDiv.html(dynNum).show();

		if (dynNum) {
			$("#dynamic_num").html(dynNum).show();
		}
		if (info.dynamic && parseInt(info.dynamic.r)) {
			//$("#review_num").html(parseInt(info.dynamic.r)).show();
		}
		initDynWnd(info);
		initMiniWnd(true);
		initDrawyooDyn(info);
		initLiveDyn();
		RequireModule.registerScript('messageModule', 'message/message.v1.min.js');
		RequireModule.getScript('messageModule', function() {
			messageModule.load();
		});
	} else {
		$("li[guest=\"no\"]").hide();
		$("li[guest=\"yes\"]").show();
	}
}

onLoginInfoLoaded(onLoginNavigator);

function loadLoginStatus(reload) {
	var cache_status;
	var load_status_byNet = function() {
		$('<script type="text/javascript" src="' + utils.protocolRelative('//interface.bilibili.com/nav.js') + '"></script>').appendTo("body");
	}
	try {
		if (window.sessionStorage && (cache_status = window.sessionStorage.bili_login_status) && (cache_status = JSON.parse(cache_status)) && (new Date().getTime() < cache_status[0]) && (!__GetCookie("DedeUserID") && cache_status[3] === undefined || parseInt(__GetCookie("DedeUserID")) == cache_status[3]) && reload !== true) {
			window.AttentionList = cache_status[2];
			window.uid = cache_status[3];
			window.last_fav = cache_status[4];
			window.BangumiFavList = cache_status[5];
			loadLoginInfo(cache_status[1], true);
		} else {
			load_status_byNet();
		}
	} catch (err) {
		load_status_byNet();
	}
}

function getLoginStatusCache() {
	if (window.sessionStorage && window.sessionStorage.bili_login_status) {
		return JSON.parse(window.sessionStorage.bili_login_status);
	} else {
		return null;
	}
}

function setLoginStatusCache(data) {
	if (data && window.sessionStorage && window.sessionStorage.bili_login_status) {
		window.sessionStorage.bili_login_status = JSON.stringify(data);
	}
}

/*特殊滚动条事件*/
$.fn.smoothScroll = function(opt, callback) {
	var _elems = this;
	//每次滚动位移 
	this.step = opt ? opt.step || 100 : 100;
	//缓动系数   
	this.f = opt ? opt.f || 0.1 : 0.1;
	this.interval = 10;
	this.intervalID = null;
	this.isFF = navigator.userAgent.toLowerCase().indexOf("firefox") >= 0;
	this.upOrDown = "";
	this.init = function(elem) {
		var _this = this;
		if (_this.isFF) {
			elem.addEventListener('DOMMouseScroll', function(e) {
				_this.upOrDown = e.detail < 0 ? "up" : "down";
				_this.scrollHandler(elem);
				e.preventDefault();
			}, false);
		} else {
			elem.onmousewheel = function(e) {
				e = e || window.event;
				_this.upOrDown = e.wheelDelta > 0 ? "up" : "down";
				_this.scrollHandler(elem);
				if (e.preventDefault) {
					e.preventDefault();
				} else {
					e.returnValue = false;
				}
			}
		}
	};
	this.scrollHandler = function(e) {
		var _this = this;
		clearInterval(_this.intervalID);
		var tar = e.scrollTop + _this.step * (_this.upOrDown == "up" ? -1 : 1);
		_this.intervalID = setInterval(function() {
			e.scrollTop += (tar - e.scrollTop) * _this.f;
			if (tar == e.scrollTop || e.scrollTop == _this.lastScrollTop) {
				clearInterval(_this.intervalID);
			}
			_this.lastScrollTop = e.scrollTop;
		}, _this.interval);
	};
	_elems.each(function(i, e) {
		_elems.init(e);
	});
	return this;
};

/*绑定说明文字tooltips*/
var ToolTips = (function() {
	var Tip = function(item, offset, animation, className) {
		this.item = item;
		this.offset = offset === undefined || offset === null ? 10 : offset;
		this.animation = animation === false ? false : animation || true;
		this.className = className || 'tool-tip';
	};
	Tip.prototype = {
		item: null,
		tip: null,
		visible: false,
		show: function(text, pos, maxWidth, close) {
			var _this = this;
			if (this.visible) {
				return;
			}
			var e = this.item;
			var top = e.offset().top,
				left = e.offset().left,
				offsetTop, offsetLeft;
			var tip = this.tip = $('<div class="' + this.className + '"><div class="tip-arrow"></div><div class="tip-text"></div></div>');
			if (close === true) {
				var closeBtn = $('<div>').addClass('close').html('×').on('click', function() {
					tip.fadeOut(200, function() {
						_this.remove();
					});
				});
				tip.append(closeBtn);
			}
			if (typeof(text) != "undefined") {
				$(".tip-text", tip).html(text);
			} else {
				$(".tip-text", tip).html(e.attr("tips"));
			}
			this.visible = true;
			tip.appendTo("body");
			if (typeof(maxWidth) != "undefined" && maxWidth) {
				$(".tip-text", tip).css("max-width", maxWidth);
			}
			var _pos;
			if (typeof(pos) != "undefined") {
				_pos = pos;
			} else {
				_pos = e.attr("tips-pos");
			}
			switch (_pos) {
				case "t":
					offsetTop = -tip.outerHeight() - this.offset;
					offsetLeft = tip.outerWidth() > e.outerWidth() ? (-(tip.outerWidth() - e.outerWidth()) / 2) : 0;
					tip.addClass("tool-tip-t");
					break;
				case "b":
					offsetTop = e.outerHeight() + this.offset;
					offsetLeft = tip.outerWidth() > e.outerWidth() ? (-(tip.outerWidth() - e.outerWidth()) / 2) : 0;
					tip.addClass("tool-tip-b");
					break;
				case "l":
					offsetTop = tip.outerHeight() > e.outerHeight() ? (-(tip.outerHeight() - e.outerHeight()) / 2) : 0;
					offsetLeft = -tip.outerWidth() - this.offset;
					tip.addClass("tool-tip-l");
					break;
				case "r":
					offsetTop = tip.outerHeight() > e.outerHeight() ? (-(tip.outerHeight() - e.outerHeight()) / 2) : 0;
					offsetLeft = e.outerWidth() + this.offset;
					tip.addClass("tool-tip-r");
					break;
				default:
					offsetTop = e.outerHeight() + this.offset;
					offsetLeft = tip.outerWidth() > e.outerWidth() ? (-(tip.outerWidth() - e.outerWidth()) / 2) : 0;
					tip.addClass("tool-tip-b");
			}
			top += offsetTop;
			left += offsetLeft;
			if (this.animation) {
				this._animate(tip, _pos, top, left);
			} else {
				tip.css({
					"top": top,
					"left": left,
					"opacity": 0
				});
				tip.animate({
					"opacity": 1
				}, 300);
			}
		},
		remove: function() {
			if (this.animation) {
				this.tip.fadeOut(300, function() {
					$(this).remove();
				});
			} else {
				this.tip.remove();
			}
			this.visible = false;
		},
		_animate: function(tips, pos, top, left) {
			var aniData = {
				"opacity": 1
			};
			var direction = typeof this.animation == 'number' ? this.animation : 1,
				_moveT = direction * 5,
				_moveL = direction * 5;
			switch (pos) {
				case "t":
					aniData["top"] = top;
					_moveL = 0;
					break;
				case "b":
					aniData["top"] = top;
					_moveT = -_moveT;
					_moveL = 0;
					break;
				case "l":
					aniData["left"] = left;
					_moveT = 0;
					break;
				case "r":
					aniData["left"] = left;
					_moveL = -_moveL;
					_moveT = 0;
					break;
				default:
					aniData["top"] = top;
					_moveL = 0;
			}
			tips.css({
				"top": top + _moveT,
				"left": left + _moveL,
				"opacity": 0
			});
			tips.animate(aniData, 300);
		},
		_menterHandler: function() {

		},
		_mleaveHandler: function() {

		},
		init: function() {
			var _this = this;
			var item = this.item;
			item.off("mouseenter", this._menterHandler);
			item.off("mouseleave", this._mleaveHandler);
			this._menterHandler = function() {
				_this.show();
			};
			this._mleaveHandler = function() {
				_this.remove();
			};
			item.mouseenter(this._menterHandler);
			item.mouseleave(this._mleaveHandler);
		}
	};
	return {
		tips: [],
		bind: function(parent, offset, animation, className) {
			var _this = this;
			var items;
			if (typeof(parent) != "undefined" && parent) {
				if (typeof $(parent).attr("tips") != "undefined") {
					items = $(parent);
				} else {
					items = $("[tips]", parent);
				}
			} else {
				items = $("[tips]");
			}
			items.each(function(i, e) {
				var e = $(e);
				if (typeof e.attr("initialized") == "undefined") {
					var tip = new Tip(e, offset, animation, className);
					tip.id = _this.tips.length;
					tip.init();
					e.attr("initialized", "true");
					_this.tips.push(tip);
				}
			});
		},
		show: function(item, text, pos, maxWidth, close) {
			var _this = this;
			var inTips = 0;
			for (var i = 0; i < this.tips.length; i++) {
				var tip = this.tips[i];
				if (tip.item[0] === item[0]) {
					tip.show(text, pos, maxWidth, close);
					inTips++;
				}
			}
			if (inTips == 0) {
				var tip = new Tip(item);
				tip.show(text, pos, maxWidth, close);
				this.tips.push(tip);
				return tip;
			}
		},
		remove: function(item) {
			var _this = this;
			for (var i = 0; i < this.tips.length; i++) {
				var tip = this.tips[i];
				if (tip.item[0] === item[0]) {
					tip.remove();
				}
			}
		}
	};
})();

function hoverDelay(ele, mouseenter, mouseleave, delay) {
	var timer = null;
	ele.hover(
		function() {
			clearTimeout(timer);
			timer = setTimeout(function() {
				if (mouseenter) {
					mouseenter();
				}
			}, delay || 300);
		},
		function() {
			clearTimeout(timer);
			timer = setTimeout(function() {
				if (mouseleave) {
					mouseleave();
				}
			}, delay || 300);
		}
	);
}
/*个人信息窗口*/
function profileWnd(userInfo) {
    var btn = $('#i_menu_profile_btn'),
        wnd = $('#i_menu_profile'),
        face = btn.find('.i_face'),
        info = wnd.find('.info').addClass('clearfix');
    if (!btn.length) return;
    wnd.find('.member-menu .notice').parents('.member-menu').remove();
    wnd.find('.member-menu a').attr('target', '_blank');
    var phone = $('<a class="phone" href="https://account.bilibili.com/" target="_blank"></a>').attr({
        'tips': "前去绑定手机",
        'tips-pos': "l"
    });
    var email = $('<a class="email" href="https://account.bilibili.com/" target="_blank"></a>').attr({
        'tips': "前去绑定邮箱",
        'tips-pos': "l"
    });
    info.find('.phone, .email').remove();
    info.append(phone).append(email);
    info.find('.coin').attr('title', '硬币');
    if (userInfo.email_verified != 0) {
        email.addClass('verified').attr('tips', '已绑定');
    }
    if (userInfo.mobile_verified != 0) {
        phone.addClass('verified').attr('tips', '已绑定');
    }

    hoverDelay(btn, function() {
        if (!wnd.is(':visible')) {
            face.addClass('scale-in');
            wnd.stop().slideDown(200);
        }
    }, function() {
        wnd.stop().slideUp(200);
        face.removeClass('scale-in');
    });
    ToolTips.bind(wnd, 5, false, 'nav-tool-tip');

    wnd.find('.user-info').remove();
    var leaveTimer = null;

    function _appendTxt(target, level, box) {
        box.find('.desc-ex').remove();
        if (jcTxt[level]) {
            var exDesc = $('<div class="desc-ex l' + level + '">' + jcTxt[level] + '</div>');
            target.prepend(exDesc);
        }
    }

    var moral = userInfo.moral,
        jcLevel = 0,
        help = $('<a class="help-link" href="http://www.bilibili.com/html/help.html#j_1" target="_blank">节操值是什么？</a>');
    var jcTxt = ['无法添加标签<br>无法发送弹幕、私信及发表评论', '无法添加标签<br>无法发送弹幕、私信及发表评论', null, null];
    if (moral === undefined || moral === null) {
        return;
    }
    moral = moral > 100 ? 100 : moral < 0 ? 0 : moral;
    if (moral >= 90 && moral <= 100) {
        jcLevel = 3;
    } else if (moral >= 60) {
        jcLevel = 2;
    } else if (moral >= 30) {
        help.html('如何恢复节操值').attr('href', 'http://www.bilibili.com/html/help.html#j_4');
        jcLevel = 1;
    } else if (moral >= 0) {
        help.html('如何恢复节操值').attr('href', 'http://www.bilibili.com/html/help.html#j_4');
        jcLevel = 0;
    }
    var moralInfo = $('<div class="user-info" id="jc_info"><div class="user-info-hd"><span class="t">节操</span></div><div class="points-wrp" id="points_wrp"><a href="https://account.bilibili.com/site/record?type=moral" target="_blank"><div class="points-cnt"><div class="lt"></div><div class="fill-el"></div><div class="bar"><div class="points"></div></div><div class="points-schedule"><span class="now-points">' + moral + '</span><span class="next-points">/100</span></div></div></a></div></div>').addClass('l' + jcLevel).insertAfter(wnd.find('.info'));
    var pointsWrp = moralInfo.find('#points_wrp');

    var jc_desc = $('<div class="user-info-desc"><span class="arrow-left"></span>每天登陆可以恢复1点节操值（70封顶）<br>举报违规弹幕&评论成功可获得节操值</div>').hide().appendTo(pointsWrp);
    _appendTxt(jc_desc, jcLevel, moralInfo);

    moralInfo.mouseenter(function(event) {
        clearTimeout(leaveTimer);
        jc_desc.stop(true, true).fadeIn(200);
        lv_desc.stop(true, true).fadeOut(200);
    }).mouseleave(function(event) {
        leaveTimer = setTimeout(function() {
            jc_desc.stop(true, true).fadeOut(200);
        }, 300);
    });

    moralInfo.find('.user-info-desc').append(help);
    moralInfo.find('.points').css('width', moral + '%');

    if(!userInfo.level_info) {
        userInfo.level_info = {
            current_level: 0,
            current_min: 0,
            current_exp: 0,
            next_exp: 0
        };
    }

    for(var i in userInfo.level_info) {
        userInfo.level_info[i] = parseInt(userInfo.level_info[i]) >> 0;
    }
    if((userInfo.level_info.next_exp >> 0) === 0) {
        userInfo.level_info.next_exp = '-';
    }

    var level = userInfo.level_info,
        lvHelp = $('<a class="help-link" href="http://www.bilibili.com/html/help.html#k" target="_blank">会员等级相关说明 ></a>');
    var levelTxt = ['成为正式会员，你可以：<br/>1、发射个性弹幕<br/>2、参与视频评论<br/>3、登录获得硬币<br/>4、投稿成为偶像',
                    '1、发射滚动弹幕<br/>2、参与视频评论<br/>3、登录获得硬币（1硬币/天）<br/>4、投稿成为偶像',
                    '1、发射个性弹幕（彩色、高级、顶部）<br/>2、参与视频互动（评论、添加tag）<br/>3、登录获得硬币（1硬币/天）<br/>4、投稿成为偶像',
                    '1、发射个性弹幕（彩色、高级、顶部、底部）<br/>2、参与视频互动（评论、添加tag）<br/>3、登录获得硬币（1硬币/天）<br/>4、投稿成为偶像',
                    '1、购买邀请码（1个/月）<br/>2、发射个性弹幕（彩色、高级、顶部、底部）<br/>3、参与视频互动（评论、添加tag）<br/>4、登录获得硬币（2硬币/天）<br/>5、投稿成为偶像',
                    '1、购买邀请码（2个/月）<br/>2、发射个性弹幕（彩色、高级、顶部、底部）<br/>3、参与视频互动（评论、添加tag）<br/>4、登录获得硬币（2硬币/天）<br/>5、投稿成为偶像',
                    '1、购买邀请码（3个/月）<br/>2、发射个性弹幕（彩色、高级、顶部、底部）<br/>3、参与视频互动（评论、添加tag）<br/>4、登录获得硬币（2硬币/天）<br/>5、投稿成为偶像'
                    ];

    var levelInfo = $('<div class="user-info" id="lv_info"><div class="user-info-hd"><span class="t">等级</span></div><div class="points-wrp" id="exp_wrp"><a href="https://account.bilibili.com/site/record?type=exp" target="_blank"><div class="points-cnt"><div class="lt"></div><div class="fill-el"></div><div class="bar"><div class="points"></div></div><div class="points-schedule"><span class="now-points">' + level.current_exp + '</span><span class="next-points">/' + level.next_exp + '</span></div></div></a></div></div>').addClass('l' + level.current_level).insertAfter(wnd.find('.info'));
    var expWrp = levelInfo.find('#exp_wrp');
    if(level.current_level == 0) {
        levelInfo.find('.points-schedule').html('<a class="lv-0" href="https://account.bilibili.com/answer/base" target="_blank">答题转正直升Lv' + (level.after_answer || 2) + ' ></a>');
    }

    var lv_desc = $('<div class="user-info-desc"><span class="arrow-left"></span><div class="lv-row">作为<strong>LV'+level.current_level+'</strong>'+(level.current_level == 0 ? '，你无法享受特权' : '，你可以：')+'</div><div>'+levelTxt[level.current_level]+'</div></div>').hide().appendTo(expWrp);

    levelInfo.mouseenter(function(event) {
        clearTimeout(leaveTimer);
        lv_desc.stop(true, true).fadeIn(200);
        jc_desc.stop(true, true).fadeOut(200);
    }).mouseleave(function(event) {
        leaveTimer = setTimeout(function() {
            lv_desc.stop(true, true).fadeOut(200);
        }, 300);
    });
    levelInfo.find('.user-info-desc').append(lvHelp);
    if(level.current_level == 6) {
        levelInfo.find('.points').css('width', '100%');
    } else {
        levelInfo.find('.points').css('width', ((level.current_exp)/(level.next_exp)*100 >> 0) + '%');
    }
}

/*动态信息窗初始化*/
window.dynObjects = {};
window.defaultDynObj = null;

function initDynWnd(info) {
	var dynWnd = $('<div id="dyn_wnd"><div class="dyn_arrow"></div>' +
		'<div class="dyn_menu"><b>信息动态</b>' +
		'<div class="menu"><ul><li mode="video" class="on">视频<div class="num" id="video_num"></div></li><li mode="review">评论<div class="num" id="review_num"></div></li></ul><div class="line"></div></div></div>' +
		'<div class="dyn_list_wrapper" mode="video">' +
		'<ul class="dyn_list" mode="video"><li class="loading">loading...</li></ul></div>' +
		'<div class="dyn_list_wrapper" mode="review" style="display:none;"><ul class="dyn_list" mode="review"><li class="loading">loading...</li></ul></div>' +
		'<div class="wnd_bottom"><div class="r-l">' +
		'<a class="read-more" href="http://www.bilibili.com/account/dynamic">查看全部</a><div class="num" id="dynamic_num"></div><div class="check-all no-select"></div></div>' +
		'</div></div>');
	var nav = $('#i_menu_msg_btn');

	if (nav.length == 0) {
		return;
	}
	dynWnd.appendTo(nav);

	var dynBorderWidth = parseInt(dynWnd.css("border-left-width"));
	dynWnd.css({
		"top": nav.outerHeight(),
		"left": -dynWnd.outerWidth() / 2 + nav.outerWidth() / 2
	});
	var dynArrow = $(".dyn_arrow", dynWnd);
	if ($(window).width() <= 950) {
		var offsetRight = 60;
		dynWnd.css({
			"left": "auto",
			"right": -offsetRight
		});
		dynArrow.css({
			"left": "auto",
			"right": offsetRight - dynBorderWidth + nav.outerWidth() / 2 - dynArrow.width() / 2
		});
	}
	$(".dyn_list_wrapper", dynWnd).smoothScroll();

	var dynNum = 0;
	for (var d in info.dynamic) {
		if (d != "r") {
			dynNum += parseInt(info.dynamic[d]);
		}
	}
	var reviewNum = info.dynamic ? parseInt(info.dynamic.r) : 0;

	var dynConf = {
		type: "video",
		wnd: $("#dyn_wnd"),
		data: {
			jsonp: "jsonp",
			ps: 5,
			type: 0
		},
		target: $('.dyn_list[mode="video"]', dynWnd),
		menuItem: $('.dyn_menu li[mode="video"]', dynWnd),
		append: function(data) {
			var img = "",
				title = "",
				stitle = "",
				info = "",
				tlink = "",
				ilink = "",
				card = "",
				type = "";
			var d = data.addition;
			switch (data.type) {
				case 1:
					img = d.pic;
					title = d.author;
					card = 'card="' + d.author + '"';
					stitle = "<span>投稿了</span>";
					info = d.title;
					tlink = "http://space.bilibili.com/" + d.mid;
					ilink = d.link;
					break;
				case 3:
					img = data.source.cover;
					title = data.source.title;
					stitle = '<span>更新了</span>';
					type = '<span class="sp">番剧</span>';
					info = d.title;
					tlink = '/bangumi/i/' + data.source.season_id + '/';
					ilink = d.link;
					break;
				case 5:
					img = data.source.cover;
					title = data.source.title;
					stitle = '<span>添加了</span>';
					type = '<span class="sp">专题</span>';
					info = d.title;
					tlink = '/sp/' + title;
					ilink = d.link;
					break;
				case 6:
					img = data.source.avatar;
					title = data.source.uname;
					card = 'card="' + data.source.uname + '"';
					stitle = "<span>发表了评论</span>";
					info = data.content.msg;
					tlink = "http://space.bilibili.com/" + data.source.mid;
					ilink = d.link + data.content.flink;
					break;
				default:;

			}
			return $('<li class="d-data"><div class="preview' + (data.type == 1 ? " v" : "") + '"><img src="' + img + '" /></div><div class="r"><div class="title">' + (type ? type : "") + '<a href="' + tlink + '"' + (card != "" ? card : "") + ' target="_blank">' + title + '</a>' + stitle + '</div><div class="info"><a href="' + ilink + '" target="_blank" title="' + (data.type != 6 ? info : d.title) + '">' + info + '</a></div></div></li>');
		},
		onData: function(data) {
			var cache = CacheManager.getItem('biliLoginStatus').dynamic;
			if(cache) {
				cache.all = 0;
				CacheManager.reset('biliLoginStatus');
			}
			return data.data.feeds;
		},
		total: dynNum,
		//newTag:true,
		//historyMaxNum: 20,
		history: true
	};
	var reviewConf = {
		type: "review",
		wnd: dynConf.wnd,
		data: {
			jsonp: 'jsonp',
			ps: 5,
			type: 6
		},
		target: $('.dyn_list[mode="review"]', dynWnd),
		menuItem: $('.dyn_menu li[mode="review"]', dynWnd),
		append: dynConf.append,
		//total:reviewNum,
		//newTag:true,
		history: true
	};

	var dynObj = new dynManage(dynConf);
	var reviewObj = new dynManage(reviewConf);

	$.extend(window.dynObjects, {
		video: dynObj,
		review: reviewObj
	});
	window.defaultDynObj = dynObj;
	var timer = null;
	nav.hover(
		function() {
			clearTimeout(timer);
			if (!dynWnd.is(":visible") || parseInt(dynWnd.css("opacity")) < 1) {
				timer = setTimeout(function() {
					var defaultObj = window.defaultDynObj;
					if (!defaultObj.target.attr("loaded")) {
						defaultObj.initMenu();
						defaultObj.init();
						defaultObj.target.attr("loaded", 1);
					}
					dynWnd.stop().fadeIn("fast");
				}, 300);
			}
		},
		function() {
			clearTimeout(timer);
			timer = setTimeout(function() {
				dynWnd.stop().fadeOut("fast");
			}, 300);
		}
	);

	dynWnd.delegate(".dyn_menu li", "click", function() {
		var menu = $(this);
		if (menu.hasClass("on")) return;
		$(".dyn_menu li", dynWnd).removeClass("on");
		menu.addClass("on");
		var mode = menu.attr("mode");
		$(".dyn_list_wrapper", dynWnd).hide();
		var list = $('.dyn_list[mode="' + mode + '"]', dynWnd);
		list.parent().fadeIn("fast");
		$(".dyn_menu .line", dynWnd).animate({
			"left": menu.position().left,
			"width": menu.outerWidth()
		}, 200);
		switch (mode) {
			case "video":
				dynObj.init();
				break;
			case "review":
				$("#review_num").html("").hide();
				reviewObj.init();
				break;
			default:
		}
	});
	return window.dynObjects;
}

/*历史，收藏用小信息窗*/
function MiniWnd() {
	this.wnds = [];
}
MiniWnd.prototype = {
	init: function(parent, wndObj) {
		var _this = this;
		parent = $(parent);
		if (!parent.length) return;
		if (typeof wndObj.wnd != "object") {
			wndObj.wnd = $(wndObj.wnd);
		}
		wndObj.wnd.appendTo(parent);
		_this.setPos(parent, wndObj.wnd);
		if (typeof wndObj.timer == "undefined") {
			wndObj.timer = null;
		}
		parent.hover(
			function() {
				_this.show(wndObj);
			},
			function() {
				_this.hide(wndObj);
			}
		);
		_this.wnds.push(wndObj);
	},
	setPos: function(parent, obj) {
		obj.css({
			"left": -obj.width() / 2 + parent.width() / 2,
			"top": parent.height() - 1
		});
	},
	show: function(wndObj, callback) {
		var _this = this;
		clearTimeout(wndObj.timer);
		if (!wndObj.wnd.is(":visible") || parseInt(wndObj.wnd.css("opacity")) < 1) {
			wndObj.timer = setTimeout(function() {
				wndObj.wnd.stop().fadeIn("fast");
				_this.get(wndObj);
				if (typeof callback != "undefined") {
					callback();
				}
			}, 300);
		}
	},
	hide: function(wndObj, callback) {
		var _this = this;
		clearTimeout(wndObj.timer);
		_this.timer = setTimeout(function() {
			wndObj.wnd.stop().fadeOut("fast", function() {
				if (typeof callback != "undefined") {
					callback();
				}
			});
		}, 300);
	},
	get: function(wndObj) {
		var _this = this,
			loading = wndObj.wnd.find(".m-w-loading");
		if (loading.length == 0) {
			loading = $('<div class="m-w-loading">loading...</div>').appendTo(wndObj.wnd.find(".list"));
		}
		if (typeof wndObj.loading != "undefined" && wndObj.loading == 1) {
			return;
		}
		wndObj.loading = 1;
		if (typeof wndObj.data == "undefined") {
			$.get(utils.protocolRelative(wndObj.url), wndObj.reqData || {}, function(data) {
				wndObj.loading = 0;
				if(data.code == 0) {
					loading.remove();
					wndObj.data = data;
					wndObj.render(wndObj.wnd, data);
				} else {
					loading.html("<a>数据获取失败,点击重试</a>").find('>a').one('click', function() {
						_this.get(wndObj);
					});
				}
			}, "jsonp").error(function() {
				wndObj.loading = 0;
				loading.html("网络错误");
			});
		} else {
			wndObj.loading = 0;
			loading.remove();
			//wndObj.render(wndObj.wnd,wndObj.data);
		}
	}
};

function initMiniWnd() {
	if (!UserStatus.status().isLogin) {
		return;
	}
	var _HOST = 'http://www.bilibili.com';
	var fav = $("#i_menu_fav_btn");
	var history = $("#i_menu_history_btn");

	var miniWnd = new MiniWnd();
	if (fav.length) {
		var favWndObj = {
			wnd: $('<div class="mini-wnd"><div class="arrow-t"></div><div class="m-w-head"><b class="t left">最近收藏</b><a class="right" href="http://space.bilibili.com/#!/favlist" target="_blank">查看更多收藏\></a></div><ul class="list"></ul></div>'),
			url: "//api.bilibili.com/x/favourite/video/newest",
			reqData: {
				jsonp: 'jsonp',
				ps: 6,
				sid: __GetCookie("sid")
			},
			render: function(obj, res) {
				var list = obj.find(".list"),
					data = res.data.videos;
				list.empty();
				for (var i in data) {
					if (typeof data[i] != "object") continue;
					if (data[i].title != null) {
						var item = $('<li><a href="' + _HOST + '/video/av' + data[i].aid + '" target="_blank" title="' + data[i].title + '">' + data[i].title + '</a></li>');
					} else {
						var item = $('<li><a href="' + _HOST + '/mylist' + data[i].lid + '" target="_blank" title="' + data[i].description + '">' + data[i].description + '</a></li>');
					}
					item.appendTo(list);
				}
				if (list.children().length == 0) {
					var nodata = $('<li class="no-data">没有数据哦，多收藏点视频吧</li>').appendTo(list);
				}
			}
		};
		miniWnd.init(fav, favWndObj);
	}
	if (history.length) {
		var historyWndObj = {
			wnd: $('<div class="mini-wnd"><div class="arrow-t"></div><div class="m-w-head"><a class="right" href="http://www.bilibili.com/account/history" target="_blank">查看更多记录\></a></div><ul class="list history"></ul></div>'),
			url: "//api.bilibili.com/x/history",
			reqData: {
				jsonp: 'jsonp',
				pn: 1,
				ps: 6,
				sid: __GetCookie("sid")
			},
			render: function(obj, res) {
				var list = obj.find(".list");
				list.empty();
				var data = res.data;
				var lastview = null;
				var dateToday = getTime(new Date());
				for (var i in data) {
					if (typeof data[i] != "object") continue;
					var date = getTime(new Date(data[i].view * 1000));
					var date2 = getTime(new Date((data[i].view + 60 * 60 * 24) * 1000));
					if (compareTime(date, lastview) != 1) {
						lastview = date;
						var timeline = $('<li class="timeline"><span class="dot"></span><span class="date"></span></li>').appendTo(list);;
						if (list.find(".timeline").length == 1) {
							timeline.addClass("top");
							$('<span class="d-line"></span>').insertAfter(list.find(".dot"));
						}
						if (compareTime(date, dateToday) == 1) {
							timeline.find(".date").html("今日");
						} else if (compareTime(date2, dateToday) == 1) {
							timeline.find(".date").html("昨日");
						} else {
							timeline.find(".date").html(data[i].view_at);
						}

					}
					if (data[i].title != null) {
						var item = $('<li><a href="' + _HOST + '/video/av' + data[i].aid + '" target="_blank" title="' + data[i].title + '">' + data[i].title + '</a></li>');
					} else {
						var item = $('<li><a href="' + _HOST + '/mylist' + data[i].lid + '" target="_blank" title="' + data[i].description + '">' + data[i].description + '</a></li>');
					}
					item.appendTo(list);
				}
				if (list.children().length == 0) {
					list.addClass("empty");
					var nodata = $('<li class="no-data">没有数据哦，多看点视频吧</li>').appendTo(list);
				}
			}
		}
		miniWnd.init(history, historyWndObj);
	}

	function getTime(date) {
		return {
			year: date.getFullYear(),
			month: date.getMonth() + 1,
			day: date.getDate()
		}
	}

	function compareTime(date1, date2) {
		if (date1 == null || date2 == null) {
			return 0;
		}
		if (date1.year == date2.year && date1.month == date2.month && date1.day == date2.day) {
			return 1;
		} else {
			return 0;
		}
	}
}

function initDrawyooDyn(info) {
	var dynWnd = $("#dyn_wnd");
	var DRAW_BASE_URL = "http://h.bilibili.com";
	var menu = dynWnd.find('.menu');
	var menuLi = $('<li mode="draw">画友<div class="num" id="draw_num"></div></li>').insertAfter(menu.find('li[mode="video"]'));
	var list = $('<div class="dyn_list_wrapper" mode="draw"><ul class="dyn_list" mode="draw"><li class="loading">loading...</li></ul></div>').insertAfter(dynWnd.find(".dyn_list_wrapper:eq(" + (menuLi.index() - 1) + ")")).hide();
	list.smoothScroll();
	var drawConf = {
		type: "draw",
		wnd: dynWnd,
		data: {
			jsonp: "jsonp",
			ps: 5,
			type: 4
		},
		target: $('.dyn_list[mode="draw"]', dynWnd),
		menuItem: $('.dyn_menu li[mode="draw"]', dynWnd),
		append: function(data) {
			var d = data.addition;
			return $('<li class="d-data"><a href="' + d.link + '" target="_blank"><div class="preview p"><img src="' + d.cover + '" /></div></a><div class="r p"><div class="title"><a href="' + DRAW_BASE_URL + '/member?mod=space&uid=' + data.source.mid + '&act=p_index" target="_blank">' + data.source.uname + '</a><span>投稿了</span></div><div class="info"><a href="' + d.link + '" target="_blank" title="' + d.title + '">' + d.title + '</a></div></div></li>');
		},
		onData: function(data) {
			var cache = CacheManager.getItem('biliLoginStatus').dynamic;
			if(cache) {
				cache.hua = 0;
				CacheManager.reset('biliLoginStatus');
			}
			menuLi.find('#draw_num').hide();
			return data.data.feeds;
		},
		//newTag:true,
		history: true
	};
	menuLi.click(function() {
		drawObj.init();
	});
	if(info.dynamic && info.dynamic.hua) {
		menuLi.find('#draw_num').html(info.dynamic.hua).show();
	}
	var drawObj = new dynManage(drawConf);
	window.dynObjects.draw = drawObj;
}

/**
 * 直播动态
 */
function initLiveDyn() {
	var dynWnd = $("#dyn_wnd"),
		mode = "live";
	var BASE_URL = utils.protocolRelative("//live.bilibili.com/ajax/");
	var menu = dynWnd.find('.menu');
	var menuLi = $('<li mode="live">直播<div class="num" id="live_num"></div></li>').insertAfter(menu.find('li[mode="video"]'));
	var listWrp = $('<div class="dyn_list_wrapper"></div>').insertAfter(dynWnd.find(".dyn_list_wrapper:eq(" + (menuLi.index() - 1) + ")")).attr('mode', mode).hide();
	var list = $('<ul class="dyn_list"><li class="loading">loading...</li></ul>').attr('mode', mode).appendTo(listWrp);
	listWrp.smoothScroll();
	var liveConf = {
		type: mode,
		wnd: dynWnd,
		apiUrl: BASE_URL + "feed/list",
		data: {
			pagesize: 5
		},
		pageKey: 'page',
		target: list,
		menuItem: menuLi,
		onData: function(data) {
			return data.data.list;
		},
		getResults: function(data) {
			return data.data.results;
		},
		append: function(d) {
			var item = $('<li class="d-data live"><a href="' + d.link + '" target="_blank"><div class="preview"><img src="' + d.cover + '" /></div><div class="r p"><div class="title"><em class="uname">' + d.uname + '</em><span class="live">正在直播</span></div><div class="info">' + d.title + '</div></div></a></li>');
			var ignoreBtn = $('<div class="ignore">忽略</div>').appendTo(item).on('click', function() {
				$.get(BASE_URL + 'feedignore', {
					roomid: d.roomid
				}, function(res) {
					if (res.code == 0) {
						var num = parseInt($('#live_num').html() || 0) - 1;
						$('#live_num').html(num);
						if (num <= 0) {
							$('#live_num').hide();
						}
						item.slideUp(200, function() {
							item.remove();
						});
					} else {
						new MessageBox({
							zIndex: 10050
						}).show(ignoreBtn, res.msg);
					}
				}, 'jsonp');
			});
			return item;
		}
	};
	menuLi.click(function() {
		liveObj.init();
	});
	menu.find('li').click(function() {
		if ($(this).attr('mode') == mode) {
			dynWnd.find('.wnd_bottom').not('.live').hide();
			liveBottom.show();
		} else {
			dynWnd.find('.wnd_bottom').not('.live').show();
			liveBottom.hide();
		}
	});
	var liveBottom = $('<div class="wnd_bottom live"><div class="r-l">忽略全部</div></div>').insertAfter(listWrp).on('click', function() {
		$.post(BASE_URL + 'feedignoreall', {}, function(res) {
			if (res.code == 0) {
				$('#live_num').html('').hide();
				liveObj.removeData();
			} else {
				new MessageBox({
					zIndex: 10050
				}).show(liveBottom, res.msg);
			}
		}, 'jsonp');
	}).hide();
	var liveObj = new dynManage(liveConf);
	window.dynObjects[mode] = liveObj;
	if(window.location.protocol == 'https:') {
		menuLi.hide();
		return;
	}
	$.get(BASE_URL + 'feed/count', function(res) {
		if (res.code == 0 && res.data.count) {
			$('#live_num').show();
			var dynTotal = parseInt($('#dynamic_num_total').html() || 0);
			dynTotal += res.data.count;
			$('#dynamic_num_total').html(dynTotal).show();
		}
	}, 'jsonp');
}

/*动态信息加载管理*/
function dynManage(params) {
	var _this = this;
	this.params = params = $.extend(true, {
		pageKey: 'pn',
		total: null
	}, params);
	this.onData = this.params.onData || this.onData;
	this.getResults = this.params.getResults || this.getResults;
	this.wnd = params.wnd;
	this.page = 0;
	this.num = 0;
	this.append = params.append;
	this.data = params.data || {};
	this.target = params.target;
	this.wrapper = params.wrapper || params.target.parent();
	this.finish = 0;
	this.loading = 0;
	this.reload = 0;
	this.tempList = null;
	this.history = params.total && !params.history ? 0 : 1;
	this.historyMaxNum = params.historyMaxNum || 0;
	this.newTag = params.newTag ? true : false;
	this.tryTime = 0;
	this.TRY_MAX = 3;
	this.apiUrl = utils.protocolRelative(params.apiUrl || "//api.bilibili.com/x/feed/pull");
	this.bindScroll();
}
dynManage.prototype = {
	bindScroll: function() {
		var _this = this;
		_this.wrapper.on("scroll", function() {
			_this.scroll();
		});
	},
	init: function() {
		var _this = this;
		if (!_this.target.attr("loaded")) {
			if (_this.params.total != 0) {
				//
			} else {
				$(".loading", _this.target).remove();
				_this.noData();
			}
			_this.load();
			_this.target.attr("loaded", 1);
		}
	},
	load: function() {
		var _this = this;
		if (_this.finish) {
			_this.complete();
			return;
		}
		_this.page++;
		_this.data[_this.params.pageKey] = _this.page;
		_this.setLoading(1);
		$.ajax({
			url: _this.apiUrl,
			dataType: "jsonp",
			data: _this.data,
			success: function(data) {
				if (data.code == 0) {
					var dynState = 0,
						dataList = _this.onData(data),
						i;
					if(dataList) {
						for (i = 0; i < dataList.length; i++) {
							if (typeof(dataList[i]) != "object") break;
							var li = $(_this.append(dataList[i])).insertBefore(_this.getLoading().elem);
							if (_this.newTag && _this.num < _this.params.total) {
								$('<div class="new">new</div>').appendTo(li);
							} else if (_this.num == _this.params.total) {
								$('<li class="d-data history"><div class="history-tag">历史动态</div></li>').insertBefore(li);
								li.addClass("no-border");
							}
							_this.renderEffect(li);
							_this.num++;
							if (!_this.history && _this.num >= _this.params.total) { //不需要历史时，只显示新动态
								dynState = 1;
								break;
							} else if (_this.history && _this.historyMaxNum && (_this.num - _this.params.total) >= _this.historyMaxNum && _this.num >= _this.params.total) {
								//需要历史记录时，显示新动态，并且显示一定数量的历史动态
								dynState = 2;
								break;
							}
						}
					}
					_this.setLoading(0);
					if (!dataList || !dataList.length || dynState != 0 || _this.num >= _this.getResults(data)) {
						_this.complete();
					} else {
						if (_this.target.is(":visible") && (_this.target.height() - _this.getLoading().elem.height() < _this.wrapper.height())) {
							_this.load();
						}
					}
				} else {
					_this.accessError();
				}
			},
			error: function() {
				_this.accessError();
			}
		});
	},
	accessError: function() {
		var _this = this;
		_this.page--;
		_this.data[_this.params.pageKey] = _this.page;
		if (_this.tryTime < _this.TRY_MAX) {
			_this.getLoading().elem.addClass("error").html("(´・ω・｀)网络错误，正在重试");
			_this.load();
			_this.tryTime++;
		} else {
			_this.getLoading().elem.addClass("error m").html("(´・ω・｀)网络错误，请点击这里重新尝试").click(function() {
				$(this).removeClass("error m").html("loading...");
				_this.load();
				$(this).off("click");
			});
		}
	},
	onData: function(data) {
		return data.data.feeds;
	},
	getResults: function(data) {
		return data.data.page.count;
	},
	renderEffect: function(item) {
		item.css({
			"margin-left": "50px",
			"opacity": "0"
		});
		item.animate({
			"margin-left": "0",
			"opacity": "1"
		}, 300);
	},
	complete: function() {
		var _this = this;
		_this.finish = 1;
		if (_this.num == 0) {
			_this.noData();
			_this.wrapper.addClass("no-history").animate({
				"height": 120
			}, 100);
			_this.getLoading().elem.remove();
		} else {
			_this.getLoading().elem.addClass("f").html("(´・ω・｀)没有更多信息");
		}
	},
	getNoData: function() {
		return $(".no-data", this.target);
	},
	noData: function(txt) {
		var _this = this;
		var txt = txt || "暂时没有新动态了哦！";
		if (_this.getNoData().length == 0) {
			$('<li class="no-data">' + txt + '</li>').appendTo(_this.target).hide().fadeIn(200);
		}
	},
	getLoading: function() {
		return {
			elem: $(".loading", this.target),
			state: this.loading
		}
	},
	setLoading: function(isLoading) {
		var _this = this;
		if (isLoading) {
			if (_this.getLoading().elem.length == 0) {
				$('<li class="loading">loading...</li>').appendTo(_this.target);
			}
			_this.loading = 1;
		} else {
			_this.loading = 0;
		}
	},
	readData: function() {
		var _this = this;
		$("li", _this.target).fadeOut("200", function() {
			$(this).remove();
			if (_this.tempList != null) {
				_this.tempList.css({
					"margin-left": "-50px",
					"opacity": "0"
				});
				_this.tempList.appendTo(_this.target);
				_this.tempList.animate({
					"margin-left": "0",
					"opacity": "1"
				}, 300);
			} else {
				_this.load();
			}
			_this.reload = 0;
		});
	},
	removeData: function() {
		var _this = this;
		$("li", _this.target).animate({
			"margin-left": "-=50px",
			"opacity": "0"
		}, 300, function() {
			var isLast = $(this).is(":last-child");
			$(this).remove();
			if (isLast) {
				_this.noData();
			}
		});
	},
	scroll: function() {
		var _this = this;
		var loadingState = $(".loading", _this.target);
		if (_this.wrapper.scrollTop() + 50 >= _this.target.height() - _this.wrapper.height() && !_this.loading && !_this.finish && !_this.reload) {
			_this.load();
		}
	},
	initMenu: function() {
		var _this = this;
		var dynWnd = _this.wnd;
		var menu = dynWnd.find(".menu");
		var menuLi = _this.params.menuItem;
		var currentMode = window.defaultDynObj.params.type;
		menu.find("li").removeClass("on");
		var currentMenu = menu.find('li[mode="' + currentMode + '"]').addClass("on");
		var left = 0;
		menu.find("li").each(function(i, e) {
			var e = $(e);
			if (e.index() < currentMenu.index()) {
				left += e.width();
			} else {
				return false;
			}
		});
		menu.find(".line").css({
			"left": left,
			"width": menuLi.outerWidth()
		});
		dynWnd.find(".dyn_list_wrapper").hide();
		dynWnd.find('.dyn_list_wrapper[mode="' + currentMode + '"]').show();
	}
};

var lazyLoadContents = [];

function LazyLoad(options) {
	if (typeof(options.render) == "undefined") return;
	var obj = {
		/**
		 *  url: string						    数据加载地址 以&page=结尾
		 *  xhrParams: function() { return object; }    返回数据加载ajax参数
		 *	target: string(jQuery selector)	    目标数据Container
		 *  offsetTop: int/function() { return int; } 相对于滚动条所属容器（默认window）的offsetTop
		 *  distance: int                       离底部多少距离开始load下一批数据
		 *  autoLoad: Boolean or int             是否随滚动条自动加载 or 自动加载n次后开始手动加载
		 *  showPageAfter: int                  加载n次后显示分页
		 *	render: function(data) : String(html)
		 *	renderCallback: function(object, data)		渲染后回调
		 *  onInit								初始化完成后回调
		 *  beforeLoad							加载数据前触发的回调
		 *	onScroll: function() : Boolean		判定是否允许读取数据
		 *	onComplete: function(data)			完成后回调
		 *	onData: function() : Boolean		判定是否仍有数据
		 *	state: string(jQuery selector)		加载状态Container
		 *	noDataPrompt: string				无更多数据提示信息
		 *  onShowPage: function                显示分页时的回调
		 */
		options: {
			url: null,
			xhrParams: {},
			wrapper: options.wrapper || $(window),
			target: null,
			offsetTop: 0,
			distance: 50,
			autoLoad: true,
			showPageAfter: null,
			pageContainer: null,
			onInit: function() {},
			render: function(data) {},
			onScroll: function() {
				return false;
			},
			renderCallback: function(object, data) {},
			beforeLoad: function() {},
			onComplete: function(data) {},
			onData: null,
			state: null,
			noDataPrompt: null,
			onShowPage: null
		},
		page: 0,
		num: 0, //当前分页加载了n次数据
		autoNum: 0,
		totalPage: 1,
		showPages: 1,
		totalResults: 0,
		manualLoad: false,
		waitManualOperate: false,
		xhrParams: function() {
			return {};
		},
		_busying: false,
		_debug: false,
		_destroyed: false,
		setOption: function(key, value) {
			if(typeof key == 'object') {
				return $.extend(true, this.options, key);
			} else if (this.options[key] !== undefined) {
				this.options[key] = value;
			}
		},
		init: function() {
			var _this = this;
			if (typeof options != 'object') {
				return;
			}
			for (var k in this.options) {
				if (options.hasOwnProperty(k)) {
					this.options[k] = options[k];
				}
			}
			this.options._super = this;
			this.options.onData = this.options.onData || function() {
				return _this.page < _this.totalPage;
			};
			this.target = this.options.target = $(this.options.target);
			this.options.wrapper = $(this.options.wrapper);
			this.options.state = $(this.options.state);
			if (!this.options.state.parent().length) {
				this.options.state.appendTo(this.options.target);
			}
			if (this._debug) {
				console.log("lazyLoad: add lazyLoader " + this.options.xhrParams.url, "current counts: ", lazyLoadContents.length);
			}
			if (this.options.autoLoad !== false) {
				this.options.wrapper.on("scroll", function() {
					_this.scroll();
				});
				if (typeof this.options.autoLoad == 'number') {
					this.options.state.on('click', function() {
						if (_this.autoNum >= _this.options.autoLoad) {
							_this.autoNum = 0;
						}
						_this.load();
					});
				} else {
					this.options.state.on('click', function() {
						_this.load();
					});
				}
			} else {
				this.waitManualOperate = true;
				this.options.state.on('click', function() {
					_this.load();
				});
			}
			this.options.onInit.call(this);
		},
		empty: function() {
			this.options.target.empty();
			if (!this.options.state.parent().length) {
				this.options.state.appendTo(this.options.target);
			}
		},
		abort: function() {
			this.ajaxRequest && this.ajaxRequest.abort();
			this._busying = false;
		},
		free: function() {
			this.abort();
			this._destroyed = true;
			for (var i = 0; i < lazyLoadContents.length; i++) {
				if (lazyLoadContents[i] == this) {
					lazyLoadContents.splice(i, 1);
					break;
				}
			}
		},
		reload: function() {
			this.abort();
			this.page = 0;
			this.load();
		},
		load: function() {
			var _this = this;
			var options = this.options;
			if (this._busying) return;
			if (this._destroyed) return;

			//console.log("Show page",this.page,"/",this.totalPage,"/",Math.ceil(this.page/options.showPageAfter));

			if (typeof(options.showPageAfter) != "undefined" &&
				((this.showPages > 1 && this.page >= options.showPageAfter) || (options.showPageAfter === 1 && this.totalPage > 1))) {
				if (this.page % options.showPageAfter == 0 && this.page != 0 && !this.manualLoad) {
					this.waitManualOperate = true;
					options.state.hide();
					return;
				}
			}

			this.manualLoad = false;
			this.waitManualOperate = options.autoLoad === false ? true : false;
			this._busying = true;

			options.beforeLoad.call(this);

			this.page++;
			this.num++;
			this.autoNum++;
			if (this._debug) {
				console.log("loading page: " + this.page + " (URL: " + options.xhrParams.url + this.page + ")");
			}
			var xhrParams = $.extend(true, this.xhrParams.call(this), this.options.xhrParams);
			if (xhrParams) {
				var success = xhrParams.success,
					error = xhrParams.error;
				xhrParams.success = function(data) {
					_this._busying = false;
					if (success) {
						success.call(_this, data);
					}
					if (typeof options.autoLoad == 'number' && _this.autoNum >= options.autoLoad) {
						_this.waitManualOperate = true;
					}
					options.onComplete.call(_this, data);
				};
				xhrParams.error = function(jqXHR, textStatus) {
					if (error) {
						error.call(_this, jqXHR, textStatus);
					}
				};
			}
			this.ajaxRequest = $.ajax(xhrParams);
		},
		render: function(data) {
			var options = this.options;
			for (var i in data) {
				if (typeof(data[i]) != "object" || !i.match(/^[0-9]+$/)) continue;
				var rendObj = $(options.render(data[i]));
				if (options.target[0] == options.state.parent()[0]) {
					rendObj.insertBefore(options.state);
				} else {
					rendObj.appendTo(options.target);
				}
				if (typeof(options.renderCallback) != "undefined") {
					options.renderCallback(rendObj, data[i]);
				}
			}
		},
		scroll: function() {
			if (this.waitManualOperate) {
				return false;
			}
			var offsetTop;
			if (typeof this.options.offsetTop == 'function') {
				offsetTop = this.options.offsetTop.call(this);
			} else {
				offsetTop = this.options.offsetTop;
			}
			if (this.options.target.css('display') != 'none' && this.options.wrapper.scrollTop() + this.options.distance >= offsetTop + this.options.target.height() - this.options.wrapper.height() && !this._busying && !this.finish) {
				if (this.options.onScroll.call(this)) {
					if (this.options.onData.call(this)) {
						this.load();
					}
				}
			}
		},
		showPage: function() {
			var _this = this;
			var options = this.options;
			var curPage = Math.ceil(this.page / options.showPageAfter);
			if (this._debug) {
				console.log("Current show page: " + curPage + "  data page: " + this.page);
			}
			this._trigger('onShowPage', $(options.pageContainer), curPage, Math.ceil(this.totalPage / options.showPageAfter), this.totalResults, function(_page) {
				_this.num = 0;
				_this.autoNum = 0;
				_this.manualLoad = true;
				_this.page = (_page - 1) * options.showPageAfter;
				_this.empty();
				_this.load();
			});
		},
		_trigger: function() {
			var args = Array.prototype.slice.call(arguments, 0);
			var handler = args.shift();
			if (this.options[handler]) {
				return this.options[handler].apply(this, args);
			}
		}
	};
	lazyLoadContents.push(obj);
	return obj;
}

// 会员中心的lazyload
function lazyLoadContent(opts) {
	var opt = {};
	opt.beforeLoad = function() {
		var options = this.options;
		if (options.state) {
			options.state.show();
			options.state.find("> b").html("正在载入中...");
		}
	};
	var onComplete = opts.onComplete;
	opt.onComplete = function(data) {
		if (onComplete) {
			onComplete.call(this, data);
		}
		if (this.target.children().length == 0) {
			if ($(".nomore", this.target).length == 0) {
				$('<div class="nomore"></div>').appendTo(this.target);
			}
		}
	};
	opt.offsetTop = function() {
		return this.options.target.offset().top;
	};
	opt.onInit = function() {
		var _this = this;
		if (this.options.state) {
			this.options.state.empty();
			$('<span class="loading-spinner"></span><b>初始化中...</b>').appendTo(this.options.state).find("b").click(function() {
				_this.load();
			});
			this.options.state.css('cursor', 'pointer');
		}
	};
	opt.onShowPage = function(container, page, pages, results, callback) {
		pagelist_ul(container, page, pages, results, callback, 5);
	};
	opt = $.extend(true, opt, opts);
	var obj = $.extend(true, LazyLoad(opt), {
		xhrParams: function() {
			var obj = this;
			var options = obj.options;
			return {
				url: options.url + obj.page,
				data: options.xhrParams.data,
				dataType: 'json',
				success: function(data) {
					obj.render(data);
					obj.totalPage = data.numPages;
					obj.totalResults = data.numResults;
					obj.showPages = typeof(options.showPageAfter) != "undefined" ? Math.ceil(obj.totalPage / options.showPageAfter) : false;

					if (obj._debug) {
						console.log("loaded page: " + obj.page + " Total: " + data.numPages + " (URL: " + options.url + obj.page + ")");
					}
					if (obj.page >= data.numPages) {
						options.state.find("> .loading-spinner").hide();
						if (options.noDataPrompt) {
							options.state.find("> b").html(options.noDataPrompt);
						} else {
							options.state.hide();
						}
					} else {
						options.state.show();
						options.state.find("> .loading-spinner").show();
						options.state.find("> b").html("查看更多...");
						//if ($(document).height() < $(window).height()) obj.load();

						setTimeout(function() {
							if ($(options.target).height() == 0) return;
							/*if ($(window).scrollTop() >= $(document).height() - $(window).height() - 50) {
								obj.load();
							} else if ($(window).scrollTop() == 0) {
								if ($(options.target).offset().top + $(options.target).height() <= $(window).height()) obj.load();
							}*/
							obj.scroll();
						}, 0);
					}
					if ((obj.page % options.showPageAfter == 0 || options.showPageAfter === 1) && !obj.manualLoad) {
						obj.waitManualOperate = true;
						options.state.hide();
					} else {
						$(options.pageContainer).hide();
					}
					if ((obj.page % options.showPageAfter == 0 || obj.page >= data.numPages || options.showPageAfter === 1) && obj.showPages > 1) {
						$(options.pageContainer).show();
						obj.showPage();
					}
				}
			};
		}
	});
	obj.init();
	return obj;
}

function biliShowFloatAds(module, ads_id, adsList, closeTime, w, h, x, y) {
	try {
		var ad_id = new Date().getSeconds() % adsList.length;
		var ads = adsList[ad_id];
		if (module == 'banner') {
			if ($(".header .logo").length > 0) {
				var logo = $(".header .logo");
				var pmt = $('<div class="bili_live_pmt" b-stat="float-pmt-banner" b-stat-v="' + ads[1] + '"><a href="' + ads[1] + '" target="_blank"></a></div>').css({
					'width': w || 150,
					'height': h || 80,
					'margin-top': -20,
					'background': 'url(' + ads[0] + ') no-repeat',
					'left': logo.position().left + logo.outerWidth() + 30
				}).appendTo(".header .h-center");
				if (x) {
					pmt.css('left', x);
				}
				if (y) {
					pmt.css('top', y);
				}
				pmt.fadeIn(500);
				var pmtTimer = setTimeout(function() {
					pmt.fadeOut(1000, function() {
						pmt.remove();
					});
				}, 10000);
			}
			return pmt;
		}
		var setting = ChatGetSettings('bili-float-ads-close');
		if ($('#a_ds_' + ads_id).length || setting && parseInt(setting.split(',')[0]) == ads_id && setting.split(',')[1] && new Date().getTime() < parseInt(setting.split(',')[1])) {
			return;
		}
		var width = w || 150,
			height = h || 80,
			target = $('.z');
		if (!target.length) return;
		var adsEle = $('<a>').addClass('float-pmt').attr({
			'id': 'a_ds_' + ads_id,
			'href': ads[1],
			'target': '_blank',
			'b-stat': 'float-pmt',
			'b-stat-v': ads[1]
		}).css({
			'position': 'absolute',
			'right': -width,
			'top': $(window).scrollTop() + $(window).height() - target.offset().top - height - 220,
			'height': height,
			'width': width,
			'z-index': 10050
		});
		var img = $('<img />').attr('src', ads[0]).css({
			'width': '100%',
			'height': '100%',
			'display': 'block'
		}).appendTo(adsEle);
		var closeBtn = $('<div>×</div>').css({
			'position': 'absolute',
			'top': 0,
			'right': 0,
			'width': 20,
			'height': 20,
			'line-height': '20px',
			'font-size': 20,
			'text-align': 'center',
			'cursor': 'pointer',
			'background-color': '#ddd',
			'border-radius': '4px',
			'color': '#222'
		}).appendTo(adsEle).on('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
			adsEle.remove();
			closeTime = closeTime || 0;
			ChatSaveSettings('bili-float-ads-close', ads_id + ',' + (new Date().getTime() + closeTime * 60 * 60 * 1000));
		});
		adsEle.appendTo(target);
		$(window).on('scroll.bili-float-ads', function() {
			adsEle.css('top', $(window).scrollTop() + $(window).height() - target.offset().top - height - 220);
		});

		return adsEle;
	} catch (e) {

	}
}

function biliShowAds(module, ads_id, isWide, target, adsList) {
	var ads_size = {
		index: {
			thin: {
				'.ad-b1': {
					width: 720,
					height: 60
				},
				'.ad-b2': {
					width: 720,
					height: 60
				},
				'.ad-b3': {
					width: 970,
					height: 60
				},
				'.ad-b4': {
					width: 720,
					height: 60
				},
				'.ad-b5': {
					width: 720,
					height: 60
				},
				'.ad-c1': {
					width: 230,
					height: 70
				},
				'.ad-c2': {
					width: 230,
					height: 70
				},
				'.ad-c2-2': {
					width: 230,
					height: 70
				},
				'.ad-c3': {
					width: 230,
					height: 70
				},
				'.ad-c4': {
					width: 230,
					height: 70
				}
			},
			wide: {
				'.ad-b1': {
					width: 885,
					height: 65
				},
				'.ad-b2': {
					width: 885,
					height: 65
				},
				'.ad-b3': {
					width: 1170,
					height: 70
				},
				'.ad-b4': {
					width: 885,
					height: 65
				},
				'.ad-b5': {
					width: 885,
					height: 65
				},
				'.ad-c1': {
					width: 250,
					height: 80
				},
				'.ad-c2': {
					width: 250,
					height: 80
				},
				'.ad-c2-2': {
					width: 250,
					height: 80
				},
				'.ad-c3': {
					width: 250,
					height: 80
				}
			}
		},
		list: {
			thin: {
				'.ad-b1': {
					width: 720,
					height: 60
				},
				'.ad-b2': {
					width: 720,
					height: 60
				},
				'.ad-b3': {
					width: 720,
					height: 60
				},
				'.ad-b4': {
					width: 720,
					height: 60
				},
				'.ad-b5': {
					width: 720,
					height: 60
				},
				'.ad-c1': {
					width: 230,
					height: 70
				},
				'.ad-c2': {
					width: 230,
					height: 70
				},
				'.ad-c3': {
					width: 230,
					height: 70
				},
				'.ad-c4': {
					width: 230,
					height: 70
				}
			},
			wide: {
				'.ad-b1': {
					width: 885,
					height: 65
				},
				'.ad-b2': {
					width: 885,
					height: 65
				},
				'.ad-b3': {
					width: 885,
					height: 65
				},
				'.ad-b4': {
					width: 885,
					height: 65
				},
				'.ad-b5': {
					width: 885,
					height: 65
				},
				'.ad-c1': {
					width: 250,
					height: 80
				},
				'.ad-c2': {
					width: 250,
					height: 80
				},
				'.ad-c3': {
					width: 250,
					height: 80
				}
			}
		},
		arc: {
			thin: {
				'.ad-e1': {
					width: 980,
					height: 100
				},
				'.ad-f': {
					width: 468,
					height: 60
				},
				'.ad-fl': {
					width: 468,
					height: 60
				},
				'.ad-fr': {
					width: 468,
					height: 60
				}
			},
			wide: {
				'.ad-e1': {
					width: 1160,
					height: 100
				},
				'.ad-f': {
					width: 468,
					height: 60
				},
				'.ad-fl': {
					width: 468,
					height: 60
				},
				'.ad-fr': {
					width: 468,
					height: 60
				}
			}
		}
	};
	try {
		var ad_id = new Date().getSeconds() % adsList.length;
		var ads = adsList[ad_id];
		var w_h_html = "";
		if (ads_size[module][isWide ? 'wide' : 'thin'][target] !== undefined) {
			w_h_html = " width=\"" + ads_size[module][isWide ? 'wide' : 'thin'][target].width + "\" height=\"" + ads_size[module][isWide ? 'wide' : 'thin'][target].height + "\"";
		}

		$(target + ' #a_ds_' + ads_id).remove();
		//width="" height=""
		$(target).attr({
			'b-stat': module + target,
			'b-stat-v': ads[3]
		});
		if (ads[0] == "i") {
			// Images
			$('<a id="a_ds_' + ads_id + '" href="' + ads[3] + '" target="_blank"><img src="' + (isWide ? ads[2] : ads[1]) + '"' + w_h_html + ' border="0" /></a>').appendTo(target);
		} else {
			// Flash
			$('<embed id="a_ds_' + ads_id + '" wmode="opaque" pluginspage="http://www.adobe.com/shockwave/download/download.cgi?P1_Prod_Version=ShockwaveFlash" allowscriptaccess="none" rel="noreferrer" src="' + (isWide ? ads[2] : ads[1]) + '"' + w_h_html + ' type="application/x-shockwave-flash" allowfullscreen="true" quality="high">').appendTo(target);
		}
		$(target).show();
	} catch (err) {

	}
}

/**
 * Lazy JSON Loader 包含 Cache 和请求锁功能的JSON加载器
 * 请求锁用于处理某JSON请求还没返回，就再次请求的问题
 */

var LazyJSONLoader = function() {}

LazyJSONLoader.prototype = {
	cache: {},
	queue: {},

	/**
	 * Get JSON Data
	 * 获取JSON数据
	 *
	 * Parameter 
	 * 		url: JSON URL地址
	 * 		cb: Callback 函数参数
	 */

	getJSON: function(url, cb, errorCallback) {
		var self = this;
		if (typeof(this.cache[url]) != "undefined") {
			cb(this.cache[url]);
		} else {
			if (typeof(self.queue[url]) == "undefined") self.queue[url] = [];
			self.queue[url].push(cb);

			if (self.queue[url].length > 1) {
				return false;
			} else {
				$.getJSON(url, function(data) {
					self.cache[url] = data;
					for (var cb; cb = self.queue[url].shift();) {
						cb(data);
					}
				}).error(function() {
					self.queue[url] = [];
					if (typeof errorCallback != "undefined") {
						errorCallback();
					}
				});
			}
		}
	}
};

/**
 * 响应式页面回调管理
 */
var Responsive = {
	_callbacks: [],
	lastPageWidth: null,
	screenWidthArr: [0, 1400],
	pageWidthArr: [960, 1160],
	pageCss: [],
	init: function(force) {
		var pageWidth;
		this.pageCss = [];
		for (var i = 0; i < this.screenWidthArr.length; i++) {
			this.pageCss.push('b-page-' + this.pageWidthArr[i]);
			if ($(document).width() >= this.screenWidthArr[i]) {
				pageWidth = this.pageWidthArr[i];
			}
		}
		if (this.lastPageWidth !== null && this.lastPageWidth == pageWidth && (typeof force != "boolean" || !force)) return;
		this.lastPageWidth = pageWidth;
		this.onChange(pageWidth);
		this.reset(pageWidth);
	},
	onChange: function(pageWidth) {
		if (pageWidth == 1160) {
			$('body').addClass('widescreen');
		} else {
			$('body').removeClass('widescreen');
		}
		var isWide = pageWidth == 1160;
		if (window.ads !== undefined) {
			for (var i in window.ads) window.ads[i](isWide);
		}
	},
	add: function(fn) {
		this._callbacks.push(fn);
	},
	reset: function(pageWidth) {
		if(pageWidth === undefined) {
			pageWidth = this.lastPageWidth;
		}
		var i = 0;
		for (i = 0; i < this._callbacks.length; i++) {
			this._callbacks[i](pageWidth);
		}
	}
};

window.biliAdjust = utils.bindFn(Responsive.init, Responsive);

function _bili_crossdomain(param, callback) {
	var crossdomain_value = {};
	var has_crossdomain_update = false;
	for (var key in param) {
		var cur_val = key == "crossdomain_flag" ? "1" : __GetCookie(key);
		if (cur_val == "" && param[key] === false) continue;
		if (cur_val != param[key] && encodeURIComponent(cur_val) != param[key]) {
			crossdomain_value[key] = cur_val;
			has_crossdomain_update = true;
		}
	}
	if (has_crossdomain_update) {
		var url = "http://interface.bilibili.com/crossdomain_cookie.do?callback=?";
		for (var i in crossdomain_value) {
			url += "&" + i + "=" + encodeURIComponent(crossdomain_value[i]);
		}
		$.getJSON(url, callback);
	}
}

function biliCachedJSON(path, key, expires, callback, verify_callback) {
	var ajaxOpt = {
		url: path,
		type: "GET",
		dataType: "json",
		success: callback
	};
	var cache_status;
	if (!window.sessionStorage) {
		$.ajax(ajaxOpt);
		return;
	}
	try {
		ajaxOpt.success = function(data) {
			cache_status = [new Date().getTime() + expires * 1000, data];
			window.sessionStorage[key] = JSON.stringify(cache_status);
			typeof(callback) == "function" && callback(data);
		};
		if (undefined === (cache_status = window.sessionStorage[key])) {
			$.ajax(ajaxOpt);
			return;
		}
		cache_status = JSON.parse(cache_status);
		if (cache_status.length != 2) {
			$.ajax(ajaxOpt);
			return;
		}
		if (new Date().getTime() < cache_status[0] && (typeof(verify_callback) != "function" || verify_callback(cache_status[1]))) {
			callback(cache_status[1]);
		} else {
			$.ajax(ajaxOpt);
		}
	} catch (err) {
		$.ajax(ajaxOpt);
	}
}

/*绑定下拉菜单*/
var SelectModule = (function() {
	var selectObjects = [];

	function SelectMenu(target, params) {
		this.params = {};
		this._isMobile = browser.version.mobile || browser.version.ios || browser.version.android || browser.version.windowsphone;
		if (typeof target == "undefined") return;
		if (typeof target == 'string' || target instanceof $) {
			this.obj = $(target);
			this.params = params || {};
		} else {
			this.params = target;
			this.obj = $(this.params.item);
		}
		if (!this.obj.length) {
			return;
		}
		if (!this.obj.hasClass("b-slt")) {
			this.obj = this.obj.find(".b-slt");
		}

		this._active = false;
		if (typeof this.params.onInit != "undefined") {
			this.params.onInit(this.obj);
		}
		if (this.obj.children().length == 0 || this.params.selectorData) {
			this.obj = this.createMenu(this.obj);
		}
		this.list = this.obj.find(".list");
		this.init();
		selectObjects.push(this);
	}

	window.bindSlt = SelectMenu.bind = function(target, params) {
		return new SelectMenu(target, params);
	};

	SelectMenu.create = function(config) {
		var select = $('<div class="b-slt"></div>');
		var txt = $('<span>').addClass("txt").appendTo(select);
		var arrow = $('<div>').addClass("b-slt-arrow").appendTo(select);
		var list = $('<ul>').addClass("list").appendTo(select);
		if (config.wrapper) {
			select.wrap(config.wrapper);
		}
		var items = config.items || [];
		for (var i = 0; i < items.length; i++) {
			var params = items[i];
			var item = $('<li></li>').text(params["name"]).appendTo(list);
			if (params.selected) {
				item.attr("selected", "selected");
			}
			if (params.attributes) {
				for (var j in params.attributes) {
					item.attr(j, params.attributes[j]);
				}
			}
		}
		if (config.wrapper) {
			select = select.parent();
		}
		return select;
	};

	SelectMenu.prototype.init = function() {
		var obj = this.obj,
			self = this;
		var selected = this.list.find("[selected]");
		if (selected.length == 0) {
			selected = this.list.find("li").eq(0).attr("selected", "selected");
		}
		obj.find(".txt").html(selected.html());
		obj.off("mouseenter.selectMenu");
		obj.off("mouseleave.selectMenu");
		obj.off("click.selectMenu");
		obj.on("click.selectMenu", function(e) {
			self._tap(e);
		});
		if (!this._isMobile && this.params.hover !== false) {
			obj.on('mouseenter.selectMenu', function(e) {
				self._mover(e);
			});
			obj.on('mouseleave.selectMenu', function(e) {
				self._mout(e);
			});
		}
		this.list.find('li').off("click.selectMenu");
		this.list.on("click", "li", function(e) {
			e.stopPropagation();
			self.select(e, $(this));
		});
		obj.data('select-menu', this);
	};
	SelectMenu.prototype._mover = function(e) {
		e.stopPropagation();
		for (var i = 0; i < selectObjects.length; i++) {
			selectObjects[i]._mout(e);
		}
		if (this.obj.attr('disabled') || !this.list.length) {
			return;
		}
		var self = this;
		this.obj.addClass('on');
		this.list.show();
		this._active = true;
		this.setPos(this.list);
		if (this._isMobile || this.params.hover === false) {
			$(document).off('click.selectMenu');
			$(document).one('click.selectMenu', function(e) {
				self._mout(e);
			});
		}
	};
	SelectMenu.prototype._mout = function(e) {
		this.obj.removeClass('on');
		this.list.hide();
		this._active = false;
		if (this._isMobile || this.params.hover === false) {
			$(document).off('click.selectMenu');
		}
	};
	SelectMenu.prototype._tap = function(e) {
		if (this._active) {
			this._mout(e);
		} else {
			this._mover(e);
		}
	};
	SelectMenu.prototype.select = function(e, opt) {
		this._mout(e);
		if (opt && !this._change(opt)) return;
		else if (typeof opt == 'undefined') {
			opt = this.value();
		}
		this.change(opt, e);
	};
	SelectMenu.prototype.change = function(opt, e) {
		var opt = opt || this.value();
		if (typeof this.params.onChange == "function") {
			this.params.onChange.call(this, opt, e);
		}
	};
	SelectMenu.prototype._change = function(opt) {
		if (opt.attr("selected") || opt.attr("disabled")) return false;
		$("li", this.list).removeAttr("selected");
		opt.attr("selected", "selected");
		$(".txt", this.obj).html(opt.html());
		return true;
	};
	SelectMenu.prototype.value = function(key, value) {
		if (value) {
			var opt = this.list.find('[' + key + '="' + value + '"]');
			if (opt.length) {
				this._change(opt);
			}
			return opt;
		} else if (key) {
			return this.getSelected().attr(key);
		} else {
			return this.getSelected();
		}
	};
	SelectMenu.prototype.getSelected = function() {
		return this.list.find('[selected="selected"]');
	};
	SelectMenu.prototype.createMenu = function(elem) {
		var txt = $('<span>').addClass("txt").appendTo(elem);
		var arrow = $('<div>').addClass("b-slt-arrow").appendTo(elem);
		var params = this.params;
		this.list = $('<ul>').addClass("list").appendTo(elem);
		if (typeof params.createList != "undefined") {
			params.createList(this.list);
		}
		if (typeof params.selectorData != "undefined") {
			for (var i in params.selectorData) {
				this.add(params.selectorData[i]["name"], params.selectorData[i].attributes);
			}
		}
		return elem;
	};

	SelectMenu.prototype.add = function(name, attributes) {
		var opt = $('<li>').html(name).appendTo(this.list);
		if (typeof attributes != "undefined") {
			for (var i in attributes) {
				var attr = attributes[i];
				opt.attr(i, attr);
			}
		}
		return opt;
	};
	SelectMenu.prototype.setPos = function(elem) {
		if (elem.offset().left + elem.width() - 10 > $(".z").width()) {
			elem.css({
				"left": "auto",
				"right": "-1px"
			});
		} else {
			elem.css({
				"left": "-1px",
				"right": "auto"
			});
		}
	};
	SelectMenu.prototype.close = function(sltTarget) {
		if (sltTarget != null) {
			if (sltTarget.originalEvent) {
				$(".b-slt").each(function(i, e) {
					var _e = $(e);
					$(".list", _e).hide();
				});
			} else {
				$(".list", sltTarget).hide();
			}
		}
	};
	SelectMenu.prototype.getList = function() {
		return this.obj.find(".list");
	};
	SelectMenu.prototype.reset = function() {
		var opt = this.list.children().first();
		$("li", this.list).removeAttr("selected");
		opt.attr("selected", "selected");
		$(".txt", this.obj).html(opt.html());
		if (!opt.attr('disabled')) {
			this.change(opt);
		}
	};
	SelectMenu.prototype.disable = function() {
		this.obj.addClass('disabled');
		this.obj.off("mouseenter.selectMenu");
		this.obj.off("mouseleave.selectMenu");
		this.obj.off("click.selectMenu");
		this.list.find('li').off("click.selectMenu");
	};
	SelectMenu.prototype.enable = function() {
		this.obj.removeClass('disabled');
		this.init();
	};

	return SelectMenu;

})();

/*绑定tab*/
var TabModule = (function() {
	function Tabs(target, params) {
		if (typeof target == "undefined") return;
		if (typeof target == 'string' || target instanceof $) {
			this.obj = $(target);
			this.params = params || {};
		} else {
			this.params = target;
			this.obj = $(this.params.item);
		}
		if (!this.obj.length) {
			return;
		}
		var self = this;
		if (!this.obj.find('.on').length) {
			this.change(this.obj.children().first());
		}
		this.obj.on("click", "li, .tab-i", function(evt) {
			var tabItem = $(this);
			if (self.change(tabItem) && typeof self.params.onChange != "undefined") {
				self.params.onChange.call(self, tabItem, evt);
			}
		});
		this.obj.data('tab-menu', this);
	}
	window.bindTab = Tabs.bind = function(target, params) {
		return new Tabs(target, params);
	};
	Tabs.create = function(config) {
		var tab = $('<ul class="b-slt-tab"></ul>');
		if (config.wrapper) {
			tab.wrap(config.wrapper);
		}
		var items = config.items || [];
		for (var i = 0; i < items.length; i++) {
			var params = items[i];
			var item = $('<li></li>').text(params["name"]).appendTo(tab);
			if (params.selected) {
				item.addClass("on");
			}
			if (params.attributes) {
				for (var j in params.attributes) {
					item.attr(j, params.attributes[j]);
				}
			}
		}
		if (config.wrapper) {
			tab = tab.parent();
		}
		return tab;
	};
	Tabs.prototype.change = function(tab) {
		if (tab.hasClass('on') || tab.attr("disabled")) return false;
		$(".on", this.obj).removeClass('on');
		tab.addClass('on')
		return true;
	};
	Tabs.prototype.value = function(key, value) {
		if (value) {
			var tab = this.obj.find('[' + key + '="' + value + '"]');
			this.change(tab);
			return tab;
		} else {
			return this.obj.find('.on');
		}
	};
	return Tabs;
})();

/**
 * 侧栏导航模块
 **/
function IndexNavigator(config) {
	this.config = {
		container: '',
		sortable: false,
		nav: {},
		block: null
	};
	this._isIndex = typeof indexBlock != 'undefined' ? true : false;
	this.config.block = this._isIndex ? indexBlock : null;
	this.mergeConfig(config);
	if (!$.isArray(this.config.nav)) {
		this.config.nav = $.map(this.config.nav, function(e, i) {
			if (typeof i === 'string') {
				e.id = i;
			}
			return e;
		});
	}
	if(this.config.block && this.config.block['live']) {
		this.config.nav.unshift({
			id: 'live',
			name: '直播',
			target: '#b_live'
		});
	}
	this.originNav = this.config.nav.slice();
	this.nav = $('<div class="index-nav" id="index_nav"><div class="border"></div></div>').appendTo("body").css("opacity", 0);
	this.navItems = [];
	this.mask = $('<div>').addClass("wnd-mask");
	this.pointer = $('<div class="pointer-block"></div>').appendTo(this.nav);
	this.navList = $('<div class="nav-list"></div>').appendTo(this.nav);
	this.seq = [];
	this.isMobile = browser.version.mobile || browser.version.android;
	this.init();
}

IndexNavigator.prototype = {
	scrolling: 0,
	customizing: 0,
	apiUrl: "/widget/ajaxIndexSettings",
	localDataName: "index_user_setting",
	Cantor: {
		create: function() {
			var i;
			var factorial = [];
			factorial[0] = 1;
			for (i = 1; i < 12; i++) {
				factorial[i] = factorial[i - 1] * i;
			}
			return factorial;
		},

		encode: function(list) {
			var i, j;
			var len = list.length;
			var factorial = this.create();
			var count = [];
			for (i = 0; i < len; i++) { //获得当前未出现的比他小的数，即它右边有几个比他小的数
				count[i] = 0;
				for (j = 0; j < i; j++) {
					if (list[j] > list[i]) {
						count[j]++;
					}
				}
			}
			var hash = 0;
			for (i = 0; i < len; i++) {
				hash += count[i] * factorial[len - i - 1];
			}
			return hash;
		},

		decode: function(len, hash) {
			var i, j, k;
			var xs = [],
				js = [];
			var list = [];
			var factorial = this.create();
			for (i = len - 1, j = 0; i >= 0; i--, j++) { //辗转相除
				xs[j] = hash / factorial[i];
				if (hash != 0) {
					hash = hash % factorial[i];
				}
				js[i] = 1;
			}
			for (i = 0; i < len; i++) { //找剩下子集中的第xs[i]大元素
				var t = 0;
				for (j = 0; j < len; j++) {
					t += js[j];
					if (t > xs[i]) {
						list[i] = j;
						js[j] = 0;
						break;
					}
				}
			}
			return list;
		}
	},
	/*初始化配置*/
	init: function() {
		var _this = this, i, id;
		_this.configMap = [];
		_this.nameMap = {};
		for (i = 0; i < _this.config.nav.length; i++) {
			id = _this.config.nav[i].id;
			if (!_this.config.block[id]) continue;
			_this.nameMap[id] = _this.configMap.length;
			_this.configMap.push(id);
			_this.seq.push(id);
		}
		if (_this.config.sortable) {
			if (ChatGetSettings(_this.localDataName) != null) {
				try {
					_this.userSettings = JSON.parse(ChatGetSettings(_this.localDataName));
					_this.setNavConfig(_this.userSettings);
				} catch (e) {
					//throw e;
				}
			}
		}
		_this.createNavigator();
	},
	mergeConfig: function(config) {
		if (typeof config != 'object') {
			return;
		}
		for (var k in this.config) {
			if (config.hasOwnProperty(k)) {
				this.config[k] = config[k];
			}
		}
	},
	/*构建导航*/
	createNavigator: function() {
		var _this = this;
		_this.renderNavItem();
		if (_this.config.sortable) {
			_this.initCustomize();
		}
		var gotop = $('<div class="n-i gotop"><div class="btn_gotop" title="返回顶部"></div></div>').appendTo(_this.navList);
		if (_this.navItems.length == 0) {
			var firstNode = gotop;
			gotop.addClass("sub").append("<div>返回顶部</div>");
		} else {
			var firstNode = _this.navItems[0].item;
			_this.pointer.css({
				"top": firstNode.find(".name").position().top,
				"left": firstNode.find(".name").position().left
			});
		}
		if(this._isIndex) {
			var mobileLink = $('<div class="n-i n-i-mlink"><a href="http://app.bilibili.com/?channel=home_recommend" target="_blank"><div class="mlink-dl-msg"></div><div class="n-i-mlink-bg"></div></a></div>').appendTo(_this.navList),
				animator = new Animator({
					element: mobileLink.find('.n-i-mlink-bg'),
					frameSource: 'http://i0.hdslb.com/u_user/nav_float/tv_animate.png',
					frameWidth: 80,
					frameHeight: 80,
					totalFrame: 16
				}),
				timer;
			mobileLink.mouseenter(function() {
				animator.start(10);
				timer = setTimeout(function() {
					mobileLink.find('.mlink-dl-msg').stop(true, true).fadeIn(200);
				}, 500);
			}).mouseleave(function() {
				clearInterval(timer);
				animator.back();
				mobileLink.find('.mlink-dl-msg').stop(true, true).fadeOut(200);
			});
		}
		if (_this.navItems.length > 0 && _this.config.sortable) {
			_this._show();
		}
		_this.bindScroll();
		_this.bindClick(gotop, "body");
	},
	renderNavItem: function() {
		var _this = this;
		_this.navItems = [];
		_this.nav.find(".n-i.sortable").remove();
		var lastNode = null;
		for (var i = 0; i < _this.config.nav.length; i++) {
			var id = _this.config.nav[i].id;
			if (!_this.config.block[id]) continue;
			var item = $('<div class="n-i sortable"><div class="name">' + _this.config.nav[i]["name"] + '</div></div>');
			if (lastNode == null) {
				item.prependTo(_this.navList);
			} else {
				item.insertAfter(lastNode);
			}
			lastNode = item;
			item.data("data", {
				key: id,
				name: _this.config.nav[i]["name"],
				target: _this.config.nav[i].target
			});
			_this.bindClick(item, _this.config.nav[i].target);
			_this.navItems.push({
				item: item,
				target: _this.config.nav[i].target
			});
		}
	},
	setPosition: function() {
		var _this = this;

		function _reachTop(topElem) {
			if ($(topElem).length > 0 && top + $(window).scrollTop() < $(topElem).offset().top + $(topElem).height()) {
				return $(topElem).offset().top + $(topElem).height();
			} else {
				return false;
			}
		}
		var container;
		var margin = $("body").hasClass("widescreen") ? 20 : 5;
		if(this.config.container) {
			container = this.config.container;
		} else if ($(".main-inner").length > 0) {
			container = $(".main-inner");
		} else {
			container = $(".z_header");
		}
		var css;
		var left = container.offset().left + container.width() + margin,
			top = $(window).height() - _this.nav.height() - 50;
		if (top < 0) {
			top = 0;
		}
		if (_reachTop(".header")) {
			top = _reachTop(".header");
		} else if ($(".header").length == 0 && _reachTop(".z_top")) {
			top = _reachTop(".z_top");
		}
		if (left + _this.nav.width() <= $(window).width()) {
			css = {
				"top": top,
				"left": left,
				"right": "auto"
			};
			_this.nav.removeClass("side");
		} else {
			css = {
				"top": top,
				"left": "auto",
				"right": 0
			};
			_this.nav.addClass("side");
		}
		_this.nav.css(css);
	},
	/*根据用户排序规则，重新排序*/
	setNavConfig: function(setting) {
		var _this = this;
		var originNav = _this.originNav;
		if (typeof setting.sort != "undefined") {
			var userNavConfig = [],
				unsorted = $.extend({}, this.configMap);
			var sort = _this.Cantor.decode(_this.configMap.length, parseInt(setting.sort, 32));
			this.sort(sort, function(i) {
				delete unsorted[sort[i]];
				userNavConfig.push(originNav[sort[i]]);
			});
			for (var u in unsorted) {
				if(typeof unsorted[u] === 'function') continue;
				userNavConfig.push(originNav[u]);
			}
			_this.config.nav = userNavConfig;
		} else {
			_this.config.nav = originNav.slice();
		}
	},
	sort: function(sort, cb) {
		this.seq = [];
		for (var i = 0; i < sort.length; i++) {
			if(sort[i] === undefined) continue;
			var key = this.configMap[sort[i]];
			this.seq.push(key);
			if (cb) {
				cb(i);
			}
		}
	},
	showTip: function() {
		var _this = this;
		var tip = _this.tipWnd = $('<div>').addClass("nav-tip");
		var mask = _this.mask;
		var close = $('<div>').addClass("close").appendTo(tip);
		var ok = $('<div>').addClass("ok").appendTo(tip);

		function _close(event) {
			event.stopPropagation();
			mask.fadeOut(200, function() {
				mask.remove();
				_this.nav.removeClass("focus");
			});
			tip.fadeOut(200, function() {
				tip.remove();
			});
		}
		mask.appendTo("body").fadeIn();
		tip.appendTo("body").fadeIn();
		_this.nav.addClass("focus");
		close.on("click", _close);
		ok.on("click", _close);
	},
	/*请求用户配置，由外部调用*/
	loadSetting: function(module) {
		var _this = this;
		onLoginInfoLoaded(function(info) {
			if (window.biliLoginStatus.isLogin && (typeof _this.userSettings == "undefined" || (_this.userSettings.expires && _this.userSettings.expires < new Date().getTime()))) {
				$.ajax({
					url: _this.apiUrl,
					type: "post",
					dataType: "json",
					success: function(data) {
						try {
							var setting = JSON.parse(data.settings);
							if (setting === false) {
								setting = {
									sort: 0
								};
								_this.uploadSetting(setting);
								_this.showTip();
							}
							_this.saveSetting(setting);
							_this.setNavConfig(setting);
							var lastBlock = null;
							ModuleManage.sort(module || ModuleManage.pageModules[0], _this.seq);
							ModuleManage.lazy();
						} catch (e) {
							setting = {};
							_this.saveSetting(setting);
							//throw e;
						}
						_this.renderNavItem();
						_this.follow();
					}
				});
			}
		});
	},
	uploadSetting: function(setting) {
		if (window.biliLoginStatus && window.biliLoginStatus.isLogin) {
			$.post(this.apiUrl, {
				act: "set",
				settings: JSON.stringify(setting)
			});
		}
	},
	saveSetting: function(setting) {
		setting.expires = new Date().getTime() + 10 * 60 * 1000;
		ChatSaveSettings(this.localDataName, JSON.stringify(setting));
		this.userSettings = $.extend(true, {}, setting);
	},
	bindClick: function(item, target) {
		var _this = this;
		item.click(function() {
			var $target = $(target);
			if (_this.customizing && _this.isMobile || !$target.length) {
				return;
			}
			_this.scrolling = 1;
			$("html,body").animate({
				"scrollTop": $target.offset().top
			}, 200, function() {
				_this.scrolling = 0;
			});
		});
	},
	bindScroll: function() {
		var _this = this;
		$(window).resize(function() {
			_this.setPosition();
		});

		$(window).scroll(function() {
			if ($(this).scrollTop() > 300 || _this.config.sortable) {
				_this._show();
			} else {
				_this._hide();
			}
			if (!_this.customizing) {
				_this.follow();
			}
		});
	},
	_show: function() {
		this.nav.show();
		this.setPosition();
		this.nav.stop().animate({
			"opacity": 1
		}, 200);
	},
	_hide: function() {
		var _this = this;
		_this.nav.stop().animate({
			"opacity": 0
		}, 200, function() {
			_this.nav.hide();
		});
	},
	/*跟随当前所在区域*/
	follow: function() {
		var _this = this;
		var wnd = $(window);
		var current = -1;
		for (var i = 0; i < _this.navItems.length; i++) {
			var item = _this.navItems[i].item;
			var target = $(_this.navItems[i].target);
			if (!target.length) continue;
			if (wnd.scrollTop() + wnd.height() / 2 > target.offset().top && wnd.scrollTop() < target.offset().top + target.height() * 2 / 3) {
				_this.nav.find(".n-i").removeClass("on");
				_this.pointer.show().css({
					"top": item.find(".name").position().top,
					"left": item.find(".name").position().left
				});
				item.addClass("on");
				current = item.index();
				if(wnd.scrollTop() + wnd.height() != $(document).height()) {
					break;
				}
			}
		}
		if (current == -1) {
			_this.nav.find(".n-i").removeClass("on");
			_this.pointer.fadeOut(100);
		}
	},
	/*自定义功能*/
	initCustomize: function() {
		var _this = this;
		_this.customContainer = $('<div class="n-i customize" title="自定义">排序</div>').appendTo(_this.navList);
		var tip = $('<div class="tip"></div>').css("z-index", 10);
		var mask = _this.mask;
		var bg = $('<div class="custom-bg"></div>');
		var localSetting = $.extend(true, {}, _this.userSettings);
		delete localSetting["expires"];

		var sortItems = this.navList.find(".sortable");
		if (this.isMobile) {
			sortItems.on("click", function() {
				if (_this.customizing) {
					var ele = $(this);
					_this.nav.find(".sort-btn-wrp").remove();
					sortItems.css({
						"background-color": "",
						"position": ""
					});
					var sortBtns = $('<div class="sort-btn-wrp"><div class="sort-btn prev">上移</div><div class="sort-btn next">下移</div></div>').css({
						position: "absolute",
						left: -53,
						top: -14,
						width: 50,
						zIndex: 30,
						lineHeight: "30px",
						fontSize: "16px",
						backgroundColor: "#ddd",
						borderRadius: "4px 0 0 4px"
					}).appendTo(ele);
					ele.css({
						"background-color": "#ddd",
						"position": "relative"
					});
					sortBtns.find(".prev").on("click", function(event) {
						event.stopPropagation();
						var prev = ele.prev();
						if (prev.length && prev.hasClass("sortable")) {
							ele.insertBefore(ele.prev());
							_update(event, ele);
						}
					});
					sortBtns.find(".next").on("click", function(event) {
						event.stopPropagation();
						var next = ele.next();
						if (next.length && next.hasClass("sortable")) {
							ele.insertAfter(ele.next());
							_update(event, ele);
						}
					});
				}
			});
		}

		function _save() {
			_this.nav.removeClass("customizing");
			_this.nav.find(".sort-btn-wrp").remove();
			sortItems.css({
				"background-color": "",
				"position": ""
			});
			mask.stop().fadeOut(300, function() {
				bg.remove();
				tip.remove();
				mask.remove();
			});
			_this.nav.sortable("disable");
			_this.follow();
			_this.customizing = 0;
			$("body").off("click", _save);
			if (typeof localSetting.sort != "undefined" && (typeof _this.userSettings.sort == "undefined" || localSetting.sort != _this.userSettings.sort)) {
				_this.uploadSetting(localSetting);
				_this.saveSetting(localSetting);
			}
		}

		function _update(event, item) {
			var target = $(item.data("data").target);
			if (item.prev().hasClass("n-i")) {
				target.insertAfter(item.prev().data("data").target);
			} else {
				target.insertBefore(item.next().data("data").target);
			}
			ModuleManage.lazy();
			if (localSetting == null) {
				localSetting = {
					sort: 0
				};
			} else {
				//localSetting.sort = 0;
			}
			var sort = [];
			_this.navItems = [];
			_this.nav.find(".sortable").each(function(i, e) {
				var data = $(e).data("data");
				//localSetting.sort[data.key] = {};
				_this.navItems.push({
					item: $(e),
					target: data.target
				});
				sort.push(_this.nameMap[data.key]);
			});
			_this.sort(sort);
			localSetting.sort = _this.Cantor.encode(sort).toString(32);
			//_this.saveSetting(localSetting);
		}
		_this.nav.on("click", function(e) {
			e.stopPropagation();
		});
		_this.customContainer.click(function(e) {
			e.stopPropagation();
			if (!_this.customizing) {
				_this.pointer.hide();
				if (!mask.is(":visible")) {
					mask.appendTo("body").stop().hide().fadeIn();
				}
				if (typeof _this.tipWnd != "undefined") {
					_this.tipWnd.fadeOut(200, function() {
						_this.tipWnd.remove();
					})
				}
				bg.prependTo(_this.nav).show();
				tip.prependTo(_this.nav).show();
				_this.nav.removeClass("focus").addClass("customizing");
				_this.nav.find(".on").removeClass("on");
				if (_this.customModuleInitialized) {
					_this.nav.sortable("enable");
				} else {
					_this.nav.sortable({
						items: ".sortable",
						cancel: ".gotop,.customize",
						update: function(event, ui) {
							_update(event, ui.item)
						}
					});
					_this.customModuleInitialized = true;
				}
				_this.customizing = 1;
				$("body").on("click", _save);
			} else {
				_save();
			}
		});
	}
};

/**
 * 动态获取验证码
 */
window.Captcha = {
	value: null,
	_tryTime: 0,
	_maxTryTime: 5,
	_query: [],
	_xhr: null,
	async: false,
	set: function(callback, failCallback) {
		this._query.push([callback, failCallback]);
		if (this._query.length > 1) {
			return;
		}
		this._load();
	},
	_load: function() {
		var self = this;
		this._tryTime++;
		if (this._tryTime > self._maxTryTime) {
			this._tryTime = 0;
			for (var i = 0; i < self._query.length; i++) {
				if (self._query[i] && self._query[i][1]) {
					self._query[i][1]();
				}
			}
			self._query = [];
			return;
		}
		this._xhr = $.ajax({
			url: utils.protocolRelative('//www.bilibili.com/plus/widget/ajaxGetCaptchaKey.php'),
			dataType: 'json',
			async: this.async,
			success: function(data) {
				window.captcha_key = self.value = data;
				self._tryTime = 0;
				for (var i = 0; i < self._query.length; i++) {
					if (self._query[i] && self._query[i][0]) {
						self._query[i][0](data);
					}
				}
				self._query = [];
			},
			error: function() {
				setTimeout(function() {
					self._load();
				}, 500);
			}
		});
	}
};

/**
 * 图片lazyload
 */
var LazyImage = (function() {

	function LazyImage(config) {
		this.config = {
			distance: 200,
			defaultImg: 'http://static.hdslb.com/images/v3images/img_loading.png',
			mode: 'wrap'
		};
		for (var key in this.config) {
			if (config && config.hasOwnProperty(key)) {
				this.config[key] = config[key];
			}
		}
		this.covers = [];
		this._selector = '[data-img]';
		this.wrapper = '<div class="img-loading"></div>';
		this.init();
	};

	LazyImage.prototype.lazy = function(container, callback) {
		var self = this;
		$(container).find(this._selector).each(function(i, e) {
			var ele = $(e);
			if (typeof ele.attr('loaded') == 'undefined' || ele.attr('loaded') == null) {
				self.covers.push({
					element: ele,
					callback: callback
				});
			}
		});
		this.show();
	};

	LazyImage.prototype.init = function() {
		var self = this;
		$(window).on('scroll.lazyimage', function() {
			self.show();
		});
	};

	LazyImage.prototype.show = function() {
		var self = this;
		for (var i = 0; i < this.covers.length; i++) {
			var cover = this.covers[i],
				ele = cover.element,
				callback = cover.callback;
			if (ele.attr('loaded')) continue;
			if (this.config.mode == 'wrap' && !ele.parent('.img-loading').length) {
				ele.wrap(this.wrapper).parent().css({
					background: '#f5f5f5 url(http://static.hdslb.com/images/v3images/img_loading.png) center center no-repeat',
					height: '100%'
				});
			} else if (this.config.mode != 'wrap') {
				ele.attr('src', this.config.defaultImg);
			}
			if (this._inViewRange(ele)) {
				this.load(ele, callback);
				this.covers.splice(i, 1);
				i--;
			}
		}
	};

	LazyImage.prototype.load = function(ele, callback) {
		var self = this,
			img = $('<img />'),
			src = ele.attr('data-img'),
			start = new Date(),
			_retry = 0,
			_maxRetry = 2;
		img.on('load', function() {
			var end = new Date();
			var duration = end - start < 200 ? 0 : 200;
			self.unwrap(ele);
			ele.attr({
				'src': src,
				'data-img': ''
			});
			if (ele.attr('data-alt')) {
				ele.attr('alt', ele.attr('data-alt'));
				ele.removeAttr('data-alt');
			}
			if (callback && typeof callback == "function") {
				callback(ele);
			}
			ele.css('opacity', 0).animate({
				"opacity": 1
			}, duration);
		});
		img.attr('src', src);
		if (ele.attr('alt')) {
			ele.attr('data-alt', ele.attr('alt'));
			ele.removeAttr('alt');
		}
		ele.attr('loaded', 'loaded');

		img.error(function() {
			_retry++;
			if (_retry <= _maxRetry) {
				img.attr('src', src);
			} else {
				self.unwrap(ele);
			}
		});
	};
	LazyImage.prototype.unwrap = function(ele) {
		if (this.config.mode == 'wrap' && ele.parent('.img-loading').length) {
			ele.unwrap(this.wrapper);
		}
	};

	LazyImage.prototype._inViewRange = function(ele) {
		return ele.offset().top + ele.outerHeight(true) > $(window).scrollTop() - this.config.distance && ele.offset().top < $(window).scrollTop() + $(window).height() + this.config.distance && ele.offset().left + ele.outerWidth(true) >= $(window).scrollLeft() - this.config.distance && ele.offset().left <= $(window).scrollLeft() + $(window).width() + this.config.distance;
	};

	return LazyImage;
})();

/*slider组件*/
var SliderController = function(params) {
	this.params = $.extend(true, {
		mode: 'click'
	}, params);
	this._mouseIn = false;
};
SliderController.prototype = {
	pointer: 0,
	length: 0,
	timer: null,
	init: function() {
		var _this = this;
		var _params = this.params;
		if ($(_params.parent).find(".p-loading").length > 0) {
			this.loading = $(_params.parent).find(".p-loading");
		} else {
			this.loading = $('<div class="p-loading"></div>');
		}
		this.wrapper = $(_params.wrapper).appendTo($(_params.parent));
		this.container = $(_params.container).prependTo(this.wrapper);
		this.bar = $(_params.bar);
		if (_params.barContainer) {
			this.bar.appendTo(this.wrapper.find(_params.barContainer));
		} else {
			this.bar.appendTo(this.wrapper);
		}
		if (_params.dataSrc) {
			if ($(_params.parent).find(".p-loading").length == 0) {
				this.loading.appendTo(this.wrapper);
			}
			if (typeof _params.dataSrc == "string") {
				$.getJSON(_params.dataSrc, function(data) {
					_this.loading.remove();
					_this.load(data);
				});
			} else if (typeof _params.dataSrc == "object") {
				this.loading.remove();
				this.load(_params.dataSrc);
			}
		}
	},
	load: function(data) {
		var _this = this;
		var _params = this.params;
		var dataList;
		if (_params.onLoad) {
			dataList = _params.onLoad(data);
		} else {
			dataList = data.list;
		}
		if (dataList) {
			for (var i in dataList) {
				if (typeof dataList[i] != "object") continue;
				if (_params.onData && _params.onData(dataList[i]) !== false || !_params.onData) {
					this.add(dataList[i]);
				}
			}
		}
		if (this.length == 0) {
			var nodata = $('<li class="no-data">没有数据</li>').appendTo(this.container);
			this.bar.hide();
		}
		$("[bar]:eq(0)", this.bar).addClass("on");
		this.setTimer();

		if (_params.initCallback) {
			_params.initCallback(this.wrapper, data);
		}
	},
	add: function(data, callback) {
		var _this = this;
		var _params = this.params;
		var width = this.length * 100;
		var barItem = $(_params.barItem);
		barItem.appendTo(this.bar).attr("bar", "bar");
		var index = this.length;
		if (this.length == 0) {
			barItem.addClass("on");
		}
		if (_params.barRenderCallback) {
			_params.barRenderCallback(barItem, data, index);
		}
		var item;
		if (typeof _params.item == "function") {
			item = _params.item(data, index);
		} else {
			item = $(_params.item);
			$("img", item).attr("src", data.img);
			$("a", item).attr("href", data.link);
		}
		item.attr("preview", "preview");
		item.appendTo(this.container);
		if (_params.renderCallback) {
			_params.renderCallback(this.wrapper, data, index, item);
		}
		this.bindBarEvent(barItem);
		this.bindPreviewEvent(item);
		width += 100;
		this.length++;
		this.container.width(width + "%");
		if (typeof callback != "undefined") {
			callback(this.wrapper, data);
		}
	},
	bind: function() {
		var _this = this;
		var _params = this.params;
		this.wrapper = $(_params.wrapper);
		this.container = this.wrapper.find("ul").eq(0);
		this.bar = null;
		var items = this.container.children();
		this.length = items.length;
		this.container.width(this.length * 100 + "%");
		this.bindPreviewEvent(items);
		this.setTimer();
		if (_params.initCallback) {
			_params.initCallback(this.wrapper);
		}
	},
	bindBarEvent: function(elems) {
		var _this = this;
		if (browser === undefined || !browser.version.mobile && !browser.version.ios && !browser.version.android && !browser.version.windowsphone) {
			elems.hover(
				function() {
					_this._mouseIn = true;
					clearInterval(_this.timer);
					if (_this.params.mode == 'hover') {
						_this.slide($(this).index());
					}
				},
				function() {
					_this._mouseIn = false;
					_this.setTimer();
				}
			);
		}
		elems.click(function() {
			_this.slide($(this).index());
		});
	},
	barHandler: function(index) {
		var el = this.bar.find("[bar]").eq(index);
		if (el.hasClass("on")) {
			return;
		}
		this.bar.find("[bar]").removeClass("on");
		el.addClass("on");
	},
	bindPreviewEvent: function(elems) {
		var _this = this;
		elems.hover(
			function() {
				clearInterval(_this.timer);
			},
			function() {
				_this.setTimer();
			}
		);
	},
	slide: function(i) {
		var _this = this;
		var _params = this.params;
		this.pointer = i;
		if (!this._mouseIn) {
			_this.setTimer();
		}
		this.container.stop(true, true).animate({
			"margin-left": -i * 100 + "%"
		}, 200);
		this.barHandler(i);
		if (_params.slideCallback) {
			_params.slideCallback(this.wrapper, i);
		}
	},
	setTimer: function() {
		var _this = this;
		var _params = this.params;
		clearInterval(this.timer);
		if (_params.timeout == 0 || this.length == 1) {
			return;
		}
		this.timer = setInterval(function() {
			_this.next();
			if (_this.bar) {
				$("[bar]", _this.bar).removeClass("on");
				$("[bar]:eq(" + _this.pointer + ")", _this.bar).addClass("on");
			}
		}, _params.timeout || 5000);
	},
	next: function() {
		this.pointer = this.pointer < this.length - 1 ? this.pointer + 1 : 0;
		this.slide(this.pointer);
	},
	prev: function() {
		this.pointer = this.pointer > 0 ? this.pointer - 1 : this.length - 1;
		this.slide(this.pointer);
	},
	destroy: function() {
		clearInterval(this.timer);
		this.wrapper.remove();
	}
};

/**
 * suggest
 */
(function($) {
	var requestIndex = 0;

	function BilibiliSuggestion(options) {
		var that = this;
		this.options = {
			appendTo: "body",
			target: null,
			container: '<ul class="bilibili-suggest"></ul>',
			css: {}, //列表自定义css
			position: null, //默认以target的左下为原点
			positionOffset: { //相对于position的偏移，用来视情况微调
				top: 0,
				left: 0
			},
			minLength: 1, //触发查询所需的最小字符长度
			delay: 300, //输入中的触发延时
			disabled: false, //
			menuItem: "menuItem", //作为查询结果中关键字项的标记
			useBuffer: true, //是否缓存每次请求
			source: null, //数据源
			defaultSource: null, //没有任何输入时的数据源
			renderMenu: that.renderMenu,
			renderItem: that.renderItem,
			create: function() {},
			select: function() {},
			change: function() {},
			search: function() {},
			response: function() {},
			open: function() {},
			close: function() {},
			focus: function() {}
		};
		this.merge(options);
		this.options._super = this;

		this.namespace = "bilibiliSuggest";
		this.$container = $(this.options.container);
		this.$target = $(this.options.target);
		this.elements = this._getMenuItem();
		this.source = {};
		this.value = this._value();
		this.selectedItem = null;
		this.tempValue = this.value;
		this.delayTimer = null;
		this.dataBuffer = {};
		this.enterLock = 0;
		this.cancelSearch = false;

		this.loading = 0;
	}

	BilibiliSuggestion.prototype = {
		escapeRegex: function(value) {
			return value.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
		},
		filter: function(array, term) {
			var matcher = new RegExp(this.escapeRegex(term), "i");
			return $.grep(array, function(value) {
				return matcher.test(value.label || value.value || value);
			});
		},
		init: function() {
			var that = this;
			this._create();
			this._initSource('source');
			this._initSource('defaultSource');

			var namespace = this.namespace;

			this.$target.data(namespace, this);

			this.options.target.off("." + namespace);

			this.options.target.on("keydown." + namespace, function(event) {
				switch (event.keyCode) {
					case 38: // up
						that._move(event, "up");
						break;
					case 40: // down
						that._move(event, "down");
						break;
					case 9: //tab
						if (that._isActive()) {
							that._select(event);
						}
						break;
					case 13: // enter
						if (that._isActive()) {
							event.preventDefault();
							that._select(event);
						}
						break;
					case 27: // esc
						if (that.$container.is(":visible")) {
							that._value(that.value);
							that.close(event);
							event.preventDefault();
						}
						break;
					default:
						;
				}
			}).on("input." + namespace, function(event) {
				that._change(event);
			}).on("focusout." + namespace, function(event) {
				if (that.cancelBlur) {
					delete that.cancelBlur;
					return;
				}
				clearTimeout(that.delayTimer);
				that.close(event);
			}).on("focus." + namespace, function(event) {
				that._change(event);
			});
			return this;
		},

		_change: function(event) {
			var that = this;
			if (this.options.disabled) {
				return;
			}
			this.value = this._value();
			if (this.tempValue == this.value && event.type != "focus") {
				return;
			}
			this.tempValue = this.value;
			event.stopPropagation();
			this.search(event);
			this._trigger("change", event, {
				item: this.selectedItem
			});
		},

		_move: function(event, direct) {
			if (!this.$container.is(":visible")) {
				return;
			}
			this.enterLock = 0;
			var start, offset;
			this.selectedItem = null;
			if (direct == "up") {
				start = "last";
				offset = -1;
			} else {
				start = "first";
				offset = 1;
			}
			if (this._getMenuItemFocused().length == 0) {
				this.selectedItem = this.elements[start]().addClass("focus");
			} else {
				var currentIndex = this._getMenuItemFocused().index("[role=" + this.options.menuItem + "]");
				this.elements.removeClass("focus");
				var nextIndex = currentIndex + offset;
				if (nextIndex >= 0 && nextIndex < this.elements.length) {
					this.selectedItem = this.elements.filter(":eq(" + (currentIndex + offset) + ")").addClass("focus");
				}
			}
			if (this.selectedItem != null) {
				if (this.selectedItem.position().top + this.selectedItem.outerHeight() >= this.$container.height()) {
					this.$container.scrollTop(this.$container.scrollTop() + (this.selectedItem.position().top + this.selectedItem.outerHeight() - this.$container.height()));
				} else if (this.selectedItem.position().top < 0) {
					this.$container.scrollTop(this.$container.scrollTop() + this.selectedItem.position().top);
				}
				this._focus(event);
			} else {
				this._value(this.value);
			}
			event.preventDefault();
		},

		_isActive: function() {
			return this.$container.is(":visible") && this.selectedItem;
		},

		_getMenuItem: function() {
			return this.$container.find("[role=" + this.options.menuItem + "]");
		},

		_getMenuItemFocused: function() {
			return this._getMenuItem().filter(".focus");
		},

		merge: function(options) {
			if (typeof options != "object") {
				return;
			}
			for (var k in this.options) {
				if (options.hasOwnProperty(k)) {
					this.options[k] = options[k];
				}
			}
		},

		/**
		 * 调用options内的回调方法
		 */
		_trigger: function() {
			var args = Array.prototype.slice.call(arguments, 0);
			var handler = args.shift();
			if (this.options[handler]) {
				return this.options[handler].apply(this, args);
			}
		},

		_create: function() {
			this._setPos();
			this.$container.appendTo(this.options.appendTo).hide();
			if (typeof this.options.css == "object") {
				this.$container.css(this.options.css);
			}
			this._trigger("create");
		},

		enable: function() {
			this.options.disabled = false;
		},

		disable: function() {
			clearTimeout(this.delayTimer);
			this.options.disabled = true;
		},

		destroy: function() {
			clearTimeout(this.delayTimer);
			this.$target.removeData(this.namespace);
			this.$target.off('.' + this.namespace);
			this.$container.remove();
		},

		_setPos: function() {
			var position = this.options.position || {};
			if (!this.options.position) {
				position.top = this.$target.offset().top + this.$target.outerHeight();
				position.left = this.$target.offset().left;
			}
			this.$container.css({
				top: position.top + this.options.positionOffset.top,
				left: position.left + this.options.positionOffset.left
			});
		},

		_open: function(event) {
			this._setPos();
			this.$container.show();
			this._trigger("open", this.$container, event);
		},

		close: function() {
			this.cancelSearch = true;
			this._close();
		},

		_close: function(event) {
			this.$container.hide();
			this._trigger("close", this.$container, event);
		},

		_initSource: function(sourceName) {
			var array, url,
				that = this;
			if ($.isArray(this.options[sourceName])) {
				array = this.options[sourceName];
				this.source[sourceName] = function(request, response) {
					response(that.filter(array, request.term));
				};
			} else if (typeof this.options[sourceName] === "string") {
				url = this.options[sourceName];
				this.source[sourceName] = function(request, response) {
					if (that.xhr) {
						that.xhr.abort();
					}
					that.xhr = $.ajax({
						url: url,
						data: request,
						dataType: "json",
						success: function(data) {
							response(data);
						},
						error: function() {
							response([]);
						}
					});
				};
			} else {
				this.source[sourceName] = this.options[sourceName];
			}
		},

		search: function(event) {
			var that = this;
			clearTimeout(this.delayTimer);
			this.delayTimer = setTimeout(function() {
				that.selectedItem = null;
				that._search(null, event);
			}, this.options.delay);

		},

		_search: function(value, event) {
			value = value != null ? value : this._value();
			this.value = this._value();
			var sourceName = 'source';
			this.cancelSearch = false;
			if (!this._value()) {
				sourceName = 'defaultSource';
			} else if (this._value().length < this.options.minLength) {
				this.close(event);
				return;
			}

			if (this._trigger("search", event) === false) {
				this.close(event);
				return;
			}

			if (this.options.useBuffer && typeof this.dataBuffer[value] != "undefined" && !$.isArray(this.source[sourceName])) {
				this._response(this.dataBuffer[value]);
			} else {
				if (!this.source[sourceName]) {
					return;
				}
				this.loading++;
				this.$container.addClass("loading");
				if (typeof this.source[sourceName] == 'function') {
					this.source[sourceName]({
						term: value
					}, this.response(value));
				}
			}
		},

		response: function(term) {
			var that = this,
				index = ++requestIndex;
			return function() {
				if (term) {
					that.dataBuffer[term] = arguments[0];
				}
				if (index === requestIndex) {
					that._response.apply(that, arguments);
				}
				that.loading--;
				if (!that.loading) {
					that.$container.removeClass("loading");
				}
			};
		},

		_response: function(data) {
			data = this._normalize(data);
			//console.log(data);
			this.render(data);
		},

		render: function(data) {
			this.$container.empty();
			var that = this;
			if (this.options.disabled || !data || $.isArray(data) && !data.length || this.cancelSearch || this._trigger("response", data) === false) {
				this._close();
				return;
			}
			this._open();
			this._renderMenu(this.$container, data);
			if (!(/AppleWebKit.*Mobile.*/i).test(navigator.userAgent)) {
				var frame = $('<iframe></iframe>').css({
					position: 'absolute',
					left: '0px',
					top: '0px',
					width: '100%',
					height: '100%',
					border: 'none',
					zIndex: -1
				}).attr({
					'border': 0,
					'frameborder': 'no'
				}).appendTo(this.$container);
			}

			this.elements = this._getMenuItem();
			this.elements.on("mousedown", function(event) {
				event.preventDefault();
				that.cancelBlur = true;
				that._delay(function() {
					delete that.cancelBlur;
				});
				/*$(document).one('click', function(event){
					if(event.target)
					clearTimeout(that.delayTimer);
					that._close(event);
				});*/
			}).on('click', function(event) {
				that._select(event);
			}).on("mouseenter", function(event) {
				var $this = $(this);
				that.enterLock = 1;
				that._getMenuItem().removeClass("focus");
				$this.addClass("focus");
				that.selectedItem = $this;
				that._focus(event);
			}).on("mouseleave", function(event) {
				var $this = $(this);
				that.enterLock = 0;
				$this.removeClass("focus");
				that.selectedItem = null;
			});
		},

		_renderMenu: function(ul, items) {
			this._trigger("renderMenu", ul, items);
		},

		renderMenu: function(ul, items) {
			var that = this;
			$.each(items, function(i, item) {
				var li = that._renderItem(ul, item);
			});
		},

		_renderItem: function(ul, item) {
			var li = this._trigger("renderItem", ul, item)
				.attr("role", this.options.menuItem)
				.data("item", item);
		},

		renderItem: function(ul, item) {
			var that = this;
			return $("<li>").addClass("suggest-item").attr({
				"data-value": item.value
			}).append($('<div>').text(item.value)).appendTo(ul);
		},

		/*
		 * 对数据进行预处理，用value和label来表示匹配到的关键字
		 */
		_normalize: function(items) {
			if (!$.isArray(items) || items.length && items[0].label && items[0].value) {
				return items;
			}
			return $.map(items, function(item) {
				if (typeof item === "string") {
					return {
						label: item,
						value: item
					};
				}
				return $.extend({
					label: item.label || item.value,
					value: item.value || item.label
				}, item);
			});
		},

		_select: function(event) {
			var item = this.selectedItem.data("item");
			if (!this.enterLock || event.originalEvent && !/^key/.test(event.originalEvent.type)) {
				this.value = this.tempValue = this._value(item.value);
			}
			this._trigger("select", event, {
				item: item
			});
			this.close();
		},

		_focus: function(event) {
			var item = this.selectedItem.data("item");
			if (this._trigger("focus", event, {
					item: item
				}) === true && event.originalEvent && /^key/.test(event.originalEvent.type)) {
				this._value(item.value);
			}
		},

		_value: function(value) {
			if (value) {
				this.$target.val(value);
			}
			return this.$target.val();
		},

		_delay: function(func) {
			setTimeout(func, 0);
		}
	};
	$.fn.bilibiliSuggestion = function(options) {
		options.target = this;
		return new BilibiliSuggestion(options).init();
	};
})(jQuery);

/**
 * 搜索历史
 */
var SearchHistory = {
	history: [],
	suggestions: [],
	maxCount: 10,
	syncCallbacks: [],
	init: function(suggestion, config) {
		if (suggestion) {
			this.suggestions.push(suggestion);
			this.read();
			this.sync();
		}
		this.config = config || {};
		if (this.config.syncCallback) {
			this.syncCallbacks.push(this.config.syncCallback);
		}
	},
	read: function() {
		if (ChatGetSettings("search_history") && typeof JSON != 'undefined') {
			this.history = JSON.parse(ChatGetSettings("search_history")) || [];
			if (!$.isArray(this.history)) {
				this.history = [];
			}
		}
		return this.history;
	},
	save: function(value) {
		var history = this.history;
		var item;
		if (typeof value == 'object') {
			item = value;
		} else {
			item = {
				value: value
			};
		}
		if (!$.trim(item.value)) {
			return;
		}
		if (encodeURIComponent(item.value)) {
			var data = {
				value: $.trim(item.value),
				isHistory: 1,
				timestamp: Date.parse(new Date())
			};
			if (item.url) {
				data.url = item.url;
			}
			var historyLen = history.length,
				_inArray = false;
			for (var i = 0; i < historyLen; i++) {
				if (history[i].value == data.value) {
					history[i] = data;
					_inArray = true;
					break;
				}
			}
			if (!_inArray) {
				if (historyLen < this.maxCount) {
					history.push(data);
				} else {
					history[historyLen - 1] = data;
				}
			}

			history = history.sort(
				function(a, b) {
					if (a.timestamp > b.timestamp) return -1;
					if (a.timestamp < b.timestamp) return 1;
					return 0;
				}
			);
			try {
				ChatSaveSettings("search_history", JSON.stringify(history));
			} catch (e) {

			}
			this.sync();
		}
	},

	remove: function(value) {
		for (var i = 0; i < this.history.length; i++) {
			if (this.history[i].value == value) {
				this.history.splice(i, 1);
				try {
					ChatSaveSettings("search_history", JSON.stringify(this.history));
				} catch (e) {

				}
				this.sync();
				break;
			}
		}
	},

	sync: function() {
		var history = this.history,
			suggestions = this.suggestions;
		for (var k = 0; k < suggestions.length; k++) {
			var s = suggestions[k].options.defaultSource;
			if (s.length != history.length || history.length && s.length && s[0] != history[0]) {
				s.splice(0, s.length);
				for (var j = 0; j < history.length; j++) {
					s.push(history[j]);
				}
			}
		}
		for (var i = 0; i < this.syncCallbacks.length; i++) {
			this.syncCallbacks[i](this.history);
		}
	},

	clear: function(callback) {
		this.history = [];
		ChatSaveSettings("search_history", null);
		this.sync();
		if (callback) {
			callback();
		}
	}
};


/**
 * 将一个消息列表转换为滚动形式的div列表,表现为伪弹幕
 * config: Object, 必要 width, height, parent, aid
 **/
function FakeDanmu(config) {
	this.messages = [];
	this.elems = [];
	this.config = {
		delay: 1, //加载弹幕前的等待时间
		rows: 2, //弹幕行数
		lifeTime: 5, //每条弹幕出现到消失的时间, 单位/s
		width: 300, //显示区域宽度, px
		height: 200, //显示区域高度, px
		parent: null, //弹幕文本的上级
		messages: null, //测试用消息
		aid: null, //av号
		cssProfix: 'fake_danmu_gen', //程序生成的css类前缀
		textStyle: [ //消息的共享css
			'color: #fff', 'font-size: 12px'
			//, 'font-weight: bold'
			, 'font-family: "Microsoft Yahei", simhei, "黑体"', 'display: inline', 'position: absolute', 'white-space: pre', 'pointer-events: none', 'opacity: 0.95', 'text-shadow: 1px 1px 2px #001', 'visibility: hidden'
		]
	};
	this.setConfig(config);
	this.duration = this.config.lifeTime;
	this.loopTimer = 0;
	this.delayTimer = 0;
	this.loadState = FakeDanmu.READY;
	this.paused = true;
	this.id = FakeDanmu._id++;

	if (FakeDanmu.styleElement == null) {
		FakeDanmu.styleElement = document.createElement('style');
		(document.head || document.getElementsByTagName('head')[0]).appendChild(FakeDanmu.styleElement);
	}

	try {
		FakeDanmu.styleElement.innerHTML = '.' + this.config.cssProfix + '_shared' + '{\r\n' + this.config.textStyle.join(';\r\n') + ';\r\n}\r\n';
	} catch (e) {
		FakeDanmu.enabled = false;
		this.loadState = FakeDanmu.COMPLETE;
	}
	//等到 play 或者 pause 之后才初始化
};

FakeDanmu._id = 0;
FakeDanmu.enabled = true;
//消息加载状态
FakeDanmu.READY = 0;
FakeDanmu.LOADING = 1;
FakeDanmu.COMPLETE = 2;

FakeDanmu.prototype = {
	constructor: FakeDanmu,
	/**
	 * msg: [String]
	 * config: Object, 必要 width, height, parent, aid
	 */
	init: function(msgs) {
		this.messages = msgs;
		this.render();
	},
	/**
	 * cfg: Object
	 */
	setConfig: function(cfg) {
		if (typeof cfg != 'object')
			return;

		for (var k in this.config) {
			if (cfg.hasOwnProperty(k)) {
				this.config[k] = cfg[k];
			}
		}
	},
	render: function() {
		this.elems = []; //reset elems
		this.duration = this.config.lifeTime; //reset total duration
		var i;
		for (i = 0; i < this.messages.length; i++) {
			var text = this.messages[i];
			var textObj = this.renderText(text);
			this.insertText(textObj);
		};
		this.restoreStyle();
	},
	/**
	 * 恢复样式表
	 */
	restoreStyle: function() {
		//generates styles
		var styleText = [];
		var i;
		styleText.push('.' + this.config.cssProfix + '_shared' + '{\r\n' + this.config.textStyle.join(';\r\n') + ';\r\n}\r\n')
		for (i = 0; i < this.elems.length; i++) {
			var obj = this.elems[i];
			styleText.push('.' + obj.cssClass + '{\r\n' + obj.cssText + '\r\n}\r\n');
		}
		FakeDanmu.styleElement.innerHTML = styleText.join('');
	},
	/**
	 * text: String
	 */
	renderText: function(text) {
		var e = document.createElement('div');
		e.appendChild(document.createTextNode(text));
		e.className = this.config.cssProfix + '_shared';
		this.config.parent.appendChild(e);
		var result = {
			elem: e,
			width: e.offsetWidth,
			height: e.offsetHeight
		};
		return result;
	},
	/**
	 * textObject: Object
	 */
	insertText: function(textObj) {
		var index = this.elems.length; //第几条弹幕
		var start = index * this.config.lifeTime / this.config.rows / this.config.rows; //出现的时间
		var row = index % this.config.rows;
		var top = textObj.height * row;
		var duration = this.config.lifeTime;
		var e = textObj.elem;
		this.duration = start + duration; // update the total duration

		var cssText = [];
		cssText.push('visibility: visible');
		cssText.push('top: ' + top + 'px');
		cssText.push('left: ' + this.config.width + 'px');
		cssText.push('transform: translateX(-' + (this.config.width + textObj.width) + 'px)');
		cssText.push('transition: transform ' + duration + 's linear ' + start + 's');

		this.elems.push({
			elem: e,
			cssClass: this.config.cssProfix + '_' + index,
			cssText: cssText.join(';\r\n') + ';'
		});
	},
	/**
	 * 暂停播放
	 */
	pause: function() {
		this.paused = true;

		if (this.config.delay > 0 && this.delayTimer != 0) {
			clearTimeout(this.delayTimer);
			this.delayTimer = 0;
			return;
		}

		if (this.loadState != FakeDanmu.COMPLETE) {
			return;
		}

		var i;
		for (i = 0; i < this.elems.length; i++) {
			var obj = this.elems[i];
			obj.elem.className = this.config.cssProfix + '_shared';
		}
		if (this.loopTimer)
			clearTimeout(this.loopTimer);
		this.loopTimer = 0;
	},
	/**
	 * 恢复播放
	 */
	play: function() {
		var self = this;
		this.paused = false;
		if (this.config.delay > 0) {
			if (this.delayTimer == 0) {
				this.delayTimer = setTimeout(function() {
					self.delayHandler();
				}, this.config.delay * 1000);
			} else {
				clearTimeout(this.delayTimer);
				this.delayTimer = setTimeout(function() {
					self.delayHandler();
				}, this.config.delay * 1000);
			}
		} else {
			this._play();
		}
	},
	_play: function() {
		//this.paused = false;
		if (this.loadState != FakeDanmu.COMPLETE) {
			this.delayHandler();
			return;
		}
		var self = this;
		var i;
		for (i = 0; i < this.elems.length; i++) {
			var obj = this.elems[i];
			obj.elem.className = this.config.cssProfix + '_shared ' + obj.cssClass;
		}
		if (this.loopTimer) {
			clearTimeout(this.loopTimer);
		}
		this.loopTimer = setTimeout(function() {
			self.restartHandler();
		}, this.duration * 1000);
	},
	/**
	 *
	 */
	restartHandler: function() {
		this.loopTimer = 0;
		this.pause();
		var self = this;
		this.loopTimer = setTimeout(function() {
			self._play();
		}, 100); //设置一定的延迟
	},
	/**
	 * aid: String
	 */
	load: function(aid) {
		if (this.loadState != FakeDanmu.READY)
			return;
		this.loadState = FakeDanmu.LOADING;
		var self = this;
		var url = '/widget/ajaxGetComment?aid=' + aid; //实际使用中应该用aid, 接口没有实现
		$.getJSON(url, function(data) {
			self.loadState = data ? FakeDanmu.COMPLETE : FakeDanmu.READY;
			if (data) {
				self.init(data);
				if (!self.paused)
					self._play();
			}
		});
	},
	/**
	 * 等待结束
	 */
	delayHandler: function() {
		clearTimeout(this.delayTimer);
		this.delayTimer = 0;

		if (this.loadState == FakeDanmu.COMPLETE) {
			this._play();
			return;
		} else if (this.loadState == FakeDanmu.READY) {
			if (this.config.aid) {
				this.load(this.config.aid);
			} else if (this.config.messages) {
				this.loadState = FakeDanmu.COMPLETE;
				this.init(this.config.messages);
				this._play();
			}
		}
	}
};

/**
 * config: Object, 必要 width, height, parent, aid
 */
FakeDanmu.play = function(config) {
	if (!FakeDanmu.enabled)
		return;
	var parent = config.parent;
	if (!parent.fakeDanmu) {
		parent.fakeDanmu = new FakeDanmu(config);
	} else {
		parent.fakeDanmu.restoreStyle();
	}
	parent.fakeDanmu.play();
	return parent.fakeDanmu;
};

/**
 * config: Object, 必要 width, height, parent, aid
 */
FakeDanmu.pause = function(config) {
	if (!FakeDanmu.enabled)
		return;
	var parent = config.parent;
	if (!parent.fakeDanmu) {
		parent.fakeDanmu = new FakeDanmu(config);
	}
	parent.fakeDanmu.pause();
	return parent.fakeDanmu;
};

/**
 * 格式化时间
 */
Date.prototype.format = function(format) {
	var o = {
		"M+": this.getMonth() + 1, //month 
		"d+|D+": this.getDate(), //day 
		"h+|H+": this.getHours(), //hour 
		"m+": this.getMinutes(), //minute 
		"s+": this.getSeconds(), //second 
		"q+": Math.floor((this.getMonth() + 3) / 3), //quarter 
		"S": this.getMilliseconds() //millisecond 
	}

	if (/(y+|Y+)/.test(format)) {
		format = format.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
	}

	for (var k in o) {
		if (new RegExp("(" + k + ")").test(format)) {
			format = format.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length));
		}
	}
	return format;
}

function addReturnToMobile() {
	if (browser.version.mobile && !browser.version.iPad) {
		$('<div class="goto-mobile"><div class="bg"></div></div>').appendTo('body').on('click', function() {
			__SetCookie('nmr', 0);
			window.location.reload();
		});
	}
}

//bilibili instant message client library
/**
 * @constructor
 * @param {number} channel_id
 */
function bbChannel(channel_id) {
	this._channel_id = channel_id;
	this._notifyHandlers = [];
	this._notifyHandlers[101] = this._emitRefreshFunctions.bind(this);
	this._pushRefreshFunctions = [];
	this._heartbeatTimer = 0;

	this._init();
}

bbChannel._debug = false;

bbChannel.prototype = {
	constructor: bbChannel,
	_init: function() {
		if (!window.WebSocket) {
			this._log("no websocket!");
			return;
		}
		this._connect();
	},
	_connect: function() {
		/**
		 * @type {WebSocket}
		 * @private
		 */
		this._conn = new WebSocket('ws://notification.bilibili.com:88/' + this._channel_id, "binary");
		this._conn.onopen = this._onOpen.bind(this);
		this._conn.onmessage = this._onMessage.bind(this);
		this._conn.onerror = this._onError.bind(this);
		this._conn.onclose = this._onClose.bind(this);

	},
	_onOpen: function(evt) {
		this._heartbeatTimer = setInterval(this._onHeartbeatHandler.bind(this), 30000);
	},
	_onHeartbeatHandler: function() {
		if (this._conn.readyState == WebSocket.OPEN) {
			this._conn.send("0102");
		}
	},
	_onMessage: function(evt) {
		var pktId = parseInt("0x" + evt.data.substr(0, 4));
		if (pktId == 7) {
			try {
				var dat = JSON.parse(evt.data.substr(4));
				if (this._notifyHandlers[dat.index]) {
					this._log("call func:", dat);
					this._notifyHandlers[dat.index](dat.index, dat.payload);
				}
			} catch (err) {

			}
		}
	},
	_onError: function(evt) {

	},
	_onClose: function(evt) {
		clearInterval(this._heartbeatTimer);
		this._heartbeatTimer = 0;

		setTimeout(this._reConnect.bind(this), 1000 + Math.floor(1000 * Math.random()));
	},
	_reConnect: function() {
		this._log('_reConnect ...');
		this._connect();
	},
	_emitRefreshFunctions: function(pktId, payload) {
		for (var i = 0; i < this._pushRefreshFunctions.length; i++) {
			this._pushRefreshFunctions[i].call(null, payload);
		}
	},
	_log: function(text) {
		if (this.constructor._debug) {
			console.log(text);
		}
	},
	//public methods
	/**
	 * setup packet handler
	 * @param {number} pktId
	 * @param {function(string)} handler
	 */
	setPacketHandler: function(pktId, handler) {
		this._log("set handler for:", pktId);
		this._notifyHandlers[pktId] = handler;
	},
	addRefreshHandler: function(handler) {
		this._pushRefreshFunctions.push(handler);
	},
	removeRefreshHandler: function(handler) {
		var index = this._pushRefreshFunctions.indexOf(handler);
		if (index != -1) {
			this._pushRefreshFunctions.splice(index, 1);
		}
	}
};

var RequireModule = (function() {
	var _requireList = {},
		_path = {},
		_baseUrl = window.location.protocol === 'https:' ? 'https://static-s.bilibili.com/' : 'http://static.hdslb.com/';

	function registerScript(id, path) {
		if ($.isPlainObject(id)) {
			for (var i in id) {
				register(i, id[i]);
			}
		} else {
			_path[id] = path;
		}
		return path;
	}

	function _getPath(module) {
		return _path[module] || registerScript(module, module);
	}

	function getScript(module, url, callback) {
		if (arguments.length == 2 && typeof url === 'function') {
			callback = url;
			url = _baseUrl + _getPath(module);
		} else if (arguments.length == 1) {
			url = _baseUrl + _getPath(module);
		}
		if (window[module]) {
			if (callback) {
				callback(window[module]);
			}
			return;
		}
		if (!_requireList[module]) {
			_requireList[module] = _requireList[module] || [];
			if (callback) {
				_requireList[module].push(callback);
			}
			$.ajax({
				url: url,
				dataType: 'script',
				cache: true,
				success: function(data) {
					for (var cb; cb = _requireList[module].shift();) {
						cb(window[module]);
					}
					delete _requireList[module];
				}
			});
		}
	}

	return {
		registerScript: registerScript,
		getScript: getScript
	};
})();

var Animator = (function($){
    function Animator(opts) {
        this.frameTimer = null;
        this.framePos = 0;
        this.reverse = false;

        this.options = $.extend({
            element: '', //jQuery object
            frameSource: '',
            frameWidth: 16,
            frameHeight: 16,
            totalFrame: 0,
            fps: 16,
            frameTimer: null,
            animationList: {},
            orientationLandscape: true
        }, opts);

        var options = this.options;
        if(!options.element) {
            return false;
        }
        options.element.css({
            'display': 'block',
            'backgroundImage': 'url('+options.frameSource+')',
            'width': options.frameWidth,
            'height': options.frameHeight,
            'backgroundPosition': '0px 0px'
        });
    };

    Animator.prototype.loadAnimation = function(frame) {
        var options = this.options;
        if(options.animationList && options.animationList[frame]) {
            this.move(options.animationList[frame].endFrame, options.animationList[frame].loopFrame);
        } else {
            return false;
        }
    }

    Animator.prototype.move = function(endFrame, loopFrame) {
        var self = this,
            options = this.options;
        clearInterval(self.frameTimer);
        this.reverse = false;
        self.frameTimer = setInterval(function(){
            self._animate(endFrame, loopFrame);
        }, 1000/options.fps);
    };

    Animator.prototype._animate = function(endFrame, loopFrame) {
        var self = this,
            options = this.options;
        if(typeof loopFrame !== 'undefined') {
            loopFrame = parseInt(loopFrame - 1) >> 0;
            if(self.framePos == endFrame) {
                if(self.framePos > loopFrame) {
                    self.framePos --;
                } else {
                    self.framePos ++;
                }
                self.reverse = true;
            } else if(self.reverse) {
                if(self.framePos == loopFrame) {
                    self.reverse = false;
                    if(self.framePos > endFrame) {
                        self.framePos --;
                    } else {
                        self.framePos ++;
                    }
                } else {
                    if(self.framePos > loopFrame) {
                        self.framePos--;
                    } else {
                        self.framePos++;
                    }
                }
            } else {
                if(self.framePos > endFrame) {
                    self.framePos--;
                } else {
                    self.framePos++;
                }
            }
        } else {
            if(self.framePos == endFrame) {
                clearInterval(self.frameTimer);
                return true;
            } else {
                if(self.framePos > endFrame) {
                    self.framePos--;
                } else {
                    self.framePos++;
                }
            }
        }

        self._setPosition(self.framePos);
    };

    Animator.prototype._setPosition = function(pos, additions) {
        var self = this,
            options = this.options;
        if(!options.element) {
            return false;
        }
        var position = pos ? pos : self.framePos;
        var x = (options.orientationLandscape ? options.frameWidth*position : options.frameWidth);
        var y = (options.orientationLandscape ? options.frameHeight : options.frameHeight*position);
        options.element.css('backgroundPosition',-x+'px '+(-y)+'px');
    };

    Animator.prototype.start = function(loopFrame){
        this.move(this.options.totalFrame-1, loopFrame);
    };

    Animator.prototype.back = function(loopFrame){
        this.move(0, loopFrame);
    };

    return Animator;
})(jQuery);

$(function() {
	$('body').on("mouseover", ".v .preview", function() {
		var aid = $(this).closest(".v").find("a").attr("href").match(/av(\d+)/);
		if (!aid) {
			return;
		}
		FakeDanmu.play({
			width: 180,
			height: 110,
			parent: this,
			aid: aid[1]
		});
	}).on("mouseout", ".v .preview", function() {
		var aid = $(this).closest(".v").find("a").attr("href").match(/av(\d+)/);
		if (!aid) {
			return;
		}
		FakeDanmu.pause({
			width: 180,
			height: 110,
			parent: this,
			aid: aid[1]
		});
	});

	if ($("#index_container").length == 0 && $(".header .num").length > 0) {
		var nav = new IndexNavigator();
	}
	$("#search-keyword").focus(function() {
		$(this).closest(".search").addClass("focus");
	});
	$("#search-keyword").focusout(function() {
		$(this).closest(".search").removeClass("focus");
	});

	if (typeof(countInfo) != "undefined") {
		var tid;
		for (var i = 0; i < tidSet.length; i++) {
			tid = tidSet[i];
			if (typeof(countInfo["c" + tid]) != "undefined" && countInfo["c" + tid]) {
				if (countInfo["c" + tid] != 0) {
					$('.addnew_' + tid).html(countInfo["c" + tid]);
					$('.addnew_' + tid).fadeIn(500);
				}
			}
		}
	}

	var suggestionOpt = window['suggestionOpt'] = {
		suggestType: 'accurate',
		subType: 'tag',
		historyLen: 5,
		form: $("#searchform"),
		submitTarget: '_blank',
		css: {
			minWidth: 240,
			maxWidth: 360
		},
		positionOffset: {
			top: 4,
			left: -14
		},
		source: function(request, response) {
			var tmp_term_lst = $.trim(request.term);
			$.getJSON("http://s.search.bilibili.com/main/suggest?jsoncallback=?", {
				func: "suggest",
				suggest_type: suggestionOpt['suggestType'],
				sub_type: suggestionOpt['subType'],
				main_ver: "v1",
				highlight: "",
				userid: window.uid || 0,
				bangumi_acc_num: 1,
				special_acc_num: 1,
				topic_acc_num: 1,
				upuser_acc_num: 3,
				tag_num: 10,
				special_num: 10,
				bangumi_num: 10,
				upuser_num: 3,
				term: tmp_term_lst,
				rnd: Math.random()
			}, function(data) {
				if (data.result) {
					response(data.result);
				} else {
					response(null);
				}
			});
		},
		defaultSource: SearchHistory.read(),
		search: function() {
			// custom minLength
			var term = $.trim(this.value);
			/*var tmp_term_lst = term.split(" ");
			if (tmp_term_lst[tmp_term_lst.length-1].length < 1) return false;*/

			if (this.value && !term || term.charCodeAt(0) < 255 && term.length < 1 || term.length > 40) {
				return false;
			}
		},
		open: function(menu, event) {
			if ($(window).width() - menu.offset().left < 360) {
				menu.css('max-width', $(window).width() - menu.offset().left - 2);
			} else {
				menu.css('max-width', 360);
			}
		},
		focus: function(event, ui) {
			// prevent value inserted on focus
			return false;
		},
		select: function(event, ui) {
			if (ui.item) {
				SearchHistory.save(ui.item);
			}
			if (ui.item.url) {
				if (event.type != 'click') {
					window.open(ui.item.url, suggestionOpt.submitTarget || '_blank');
				}
				return false;
			}
			var subType = '';
			if (ui.item.isHistory && suggestionOpt.form.find('[name=type]').length) {
				subType = suggestionOpt.form.find('[name=type]').val();
				suggestionOpt.form.find('[name=type]').val('comprehensive');
			}
			suggestionOpt.form.submit();
			if (ui.item.isHistory && suggestionOpt.form.find('[name=type]').length) {
				suggestionOpt.form.find('[name=type]').val(subType);
			}
			return false;
		},
		renderMenu: function(ul, items) {
			var that = this;
			if ($.isArray(items)) {
				$.each(items, function(i, item) {
					if (!item.isHistory) {
						delete item['url'];
					} else if (suggestionOpt.historyLen && i >= suggestionOpt.historyLen) {
						return;
					}
					var li = that._renderItem(ul, item);
				});
				return;
			}
			var result = 0;
			if (items.accurate) {
				var accurateList = $('<li class="acc"></li>').appendTo(ul);
				for (var k in items.accurate) {
					if (k == 'tag') continue;
					if (k == 'upuser') {
						var upuserList = $('<li class="up"><a href="/search?keyword=' + this.value + '&type=up" target="_blank"><div class="b-line"><p><span>UP主</span></p></div></a></li>').appendTo(ul);
						$.each(items.accurate[k], function(i, item) {
							item.TYPE = 'upuser';
							var li = that._renderItem(upuserList, item);
							result++;
						});
					} else {
						$.each(items.accurate[k], function(i, item) {
							item.TYPE = 'accurate';
							item.STYPE = k;
							var li = that._renderItem(accurateList, item);
							result++;
						});
					}
				}
			}
			var subType = suggestionOpt.subType;
			var data = items[subType];
			if (subType == 'video') {
				data = items['tag'];
			}
			if (data && data.length) {
				var _subType = subType;
				if (suggestionOpt.form.find('[name=type]').length) {
					_subType = suggestionOpt.form.find('[name=type]').val() || 'comprehensive';
				} else {
					_subType = 'comprehensive';
				}
				var subList = $('<li class="kw"><a href="/search?keyword=' + this.value + '&type=' + _subType + '" target="_blank"><div class="b-line"><p><span>关键词</span></p></div></a></li>').appendTo(ul);
				$.each(data, function(i, item) {
					delete item['url'];
					item.TYPE = 'tag';
					var li = that._renderItem(subList, item);
					result++;
				});
			}
			ul.find('.b-line').on('mousedown', function(event) {
				event.preventDefault();
			});
			if (result == 0) {
				this.close();
			}
		},
		renderItem: function(ul, item) {
			var li;
			var self = this;
			if (item.isHistory) {
				if (!ul.find('.history-t').length) {
					$('<div class="b-line history-t"><p><span>历史搜索</span></p></div>').appendTo(ul);
				}
				var del = $("<div class='cancel'></div>").click(function(event) {
					event.stopPropagation();
					event.preventDefault();

					var $this = $(this);
					$this.parent().remove();
					if (!self._getMenuItem().length) {
						self.close();
					}

					SearchHistory.remove(item.value);

				});
				if (item.isHistory && item.url) {
					li = $('<a href="' + item.url + '"></a>').attr('target', suggestionOpt.submitTarget || '_blank');
				} else {

					li = $("<li>");
				}
				li.addClass("suggest-item")
					.attr("data-value", item.value)
					.append($("<a>").text(item.value))
					.append(del)
					.appendTo(ul);
				return li;
			}
			switch (item.TYPE) {
				case 'tag':
					li = $("<li>")
						.append('<a>' + item.name + '</a>');
					break;
				case 'accurate':
					li = $('<a href="' + item.url + '" target="_blank"><div class="r-item"><div class="preview"><img src="' + (item.s_pic || item.tp_pic) + '" /></div><div class="info"><div class="t"><span class="type"></span>' + item.name + '</div><div class="v-info"><span class="sub">订阅：' + formatFriendlyNumber(item.favourite) + '</span><span class="view">浏览：' + formatFriendlyNumber(item.click) + '</span></div></div></div></a>');
					switch (item.STYPE) {
						case 'bangumi':
							li.addClass('bangumi').prependTo(ul).find('.type').html('番剧');
							$('<div class="bgm-info">更新至：' + (item.isbangumi_end ? '<span>已完结</span> / 共' + item.bgmcount + '话</div>' : '<span>第' + item.bgmcount + '话</span>') + '</div>').insertAfter(li.find('.t'));
							break;
						case 'special':
							li.addClass('special').find('.type').html('专题');
							break;
						case 'topic':
							li.addClass('topic').find('.type').html('话题');
							li.find('.sub').html('发布：' + item.writer);
							$('<div class="pubdate">时间：' + (new Date(item.pubdate * 1000).format('yyyy-MM-dd')) + '</div>').insertAfter(li.find('.t'));
							break;
						default:
							;
					}
					break;
				case 'upuser':
					li = $('<a href="' + item.url + '" target="_blank">' + item.name + '</a>');
					break;
				default:
					li = $("<li>")
						.append('<a>' + item.name + '</a>');
			}
			if (item.url) {
				li.attr('target', suggestionOpt.submitTarget || '_blank');
			}
			li.addClass("suggest-item").attr("data-value", item.value).appendTo(ul);
			return li;
		}
	};
	if ($(".search-keyword").length > 0) {
		var suggestion = $("#search-keyword").bilibiliSuggestion(suggestionOpt);
		SearchHistory.init(suggestion);
		$("#searchform").append('<input type="hidden" name="type" value="comprehensive">');
		$("#searchform").on('submit', function() {
			var $ipt = $("#search-keyword");
			var val = $ipt.val();
			if (val == "" && $ipt.attr('data-recommend')) {
				$ipt.val($ipt.attr('data-recommend'));
			}
			SearchHistory.save($("#search-keyword").val());
		});
		$.getJSON('/widget/getSearchDefaultWords', function(data) {
			if (data && data.length) {
				var d = data[Math.floor(Math.random() * data.length)];
				$("#search-keyword").attr({
					'placeholder': d.show,
					'data-recommend': d.word
				});
			}
		});
	}
	if (!$.support.opacity) {
		$("input[placeholder!=\"\"][type=text]").blur(function() {
			var placeholder = $(this).attr("placeholder");
			if (!placeholder) return;
			if (this.value === '') {
				this.value = placeholder;
				this.style.color = 'graytext';
			}
		});
		$("input[placeholder!=\"\"][type=text]").focus(function() {
			var placeholder = $(this).attr("placeholder");
			if (!placeholder) return;
			if (this.value === placeholder) {
				this.value = "";
			}
			this.style.color = '';
		});
		$("input[placeholder!=\"\"][type=text]").val(function(index, oldvalue) {
			var placeholder = $(this).attr("placeholder");
			if (!placeholder) return this.value;
			if (oldvalue === '') {
				this.style.color = 'graytext';
				return placeholder;
			} else {
				return oldvalue;
			}
		});
	}
	bindCardEvent();
	bindPOCoins2($(".v"));

	//处理播放数 "万"
	var formatTimeout = setTimeout(function() {
		$(".v .i .i1, .v .i .i2, #dianji, .w_info .gk, .w_info .sc, .w_info .dm, .rlist .i .c1, .rlist .i .c2").html(function() {
			return formatFriendlyNumber($(this).html());
		});
	}, 500);
});


/**
 * 以下是一些很旧的页面可能还在用的代码
 */
var last_sug_user_start = 0;

function createSuggestUserList(start) {
	var i;
	var k = 0;
	var n = 0;
	$("#rup_user").empty();
	if (start + 5 > suggest_user.length) start = 0;
	for (i in suggest_user) {
		k++;
		if (typeof(start) != "undefined" && k <= start) continue;
		var vo = suggest_user[i];

		var follow_him = false;
		if (typeof(window.AttentionList) != "undefined" && typeof(window.AttentionList) != "null") {
			for (var j = 0; j < window.AttentionList.length; j++) {
				if (window.AttentionList[j] == vo[0]) {
					follow_him = true;
					break;
				}
			}
		}
		if (follow_him) {
			continue;
		}
		var li = $('<li><a href="http://space.bilibili.com/' + vo[0] + '" target="_blank" card="' + vo[1] + '"><img src="' + vo[2] + '"><div class="name">' + vo[1] + '</div></a><p class="i"><a class="gz">关注</a></p><div class="info">' + vo[3] + '</div></li>').appendTo("#rup_user");
		var gz_btn = li.find(".gz");
		var uid = parseInt(vo[0]);
		(function(uid, gz_btn) {
			gz_btn.click(function() {
				if (gz_btn.attr("attention") == 1) {
					unattentionUser(gz_btn, uid, function() {
						gz_btn.html("关注").attr("attention", 0);
					});
				} else {
					attentionUser(gz_btn, uid, function() {
						gz_btn.html("取消关注").attr("attention", 1);
					});
				}
			});
		})(uid, gz_btn);
		last_sug_user_start = k;
		if (++n >= 5) break;
	}
	bindCardEvent();
}

function createSuggestSpList(start) {
	var i;
	var k = 0;
	var n = 0;
	$("#rup_sp").empty();
	if (suggest_sp.length == 0) {
		$('<div class="no_more">没有更多信息</div>').appendTo("#rup_sp");
		return;
	}
	if (start + 5 > suggest_sp.length) start = 0;
	for (i in suggest_sp) {
		k++;
		if (typeof(start) != "undefined" && k <= start) continue;
		var vo = suggest_sp[i];
		if (typeof(vo) == "undefined" || typeof(vo[0]) == "undefined") continue;
		$('<li><a href="/sp/' + vo[0] + '"><img src="' + vo[1] + '" title="' + vo[0] + '"><div class="name">' + vo[0] + '</div></a><div class="info">' + (vo[2] ? '同义词: <i>' + vo[2] + '</i>' : '') + '<p>共<b>' + vo[3] + '</b>个视频</p></div></li>').appendTo("#rup_sp");

		if (++n >= 5) break;
	}
}

$(document).ready(function() {
	$("#sp_order_alpha").click(function() {
		$('.s-alpha').slideDown(300);
	});
	$(".float_window .close").click(function() {
		$('.float_window').fadeOut(300);
	});
});

//输入字符统计
function alertCharNums(content) {
	var MaxLength = 1000;
	if (content.value.length > MaxLength) {
		content.value = content.value.substring(0, MaxLength);
	}
	$('#ajaxBackMsg').html('字符统计:' + content.value.length + '/1000');
}

function showGlobalAlert(msg) {
	tips_str = "<div class=\"ui-widget\" id=\"announce_alerts\" style=\"margin: 0px; position: fixed; top: 0px; width: 980px; z-index: 100;\">" +
		"	<div class=\"ui-state-error ui-corner-all\" style=\"padding: 0 .7em;\"> " +
		"		<p><span class=\"ui-icon ui-icon-alert\" style=\"float: left; margin-right: .3em;margin-top:.1em;\"></span>" + msg + "</p>" +
		"	</div>" +
		"</div>";
	fc = $(".z:first-child");
	fc.before(tips_str);
};

function showGlobalTips(msg) {
	tips_str = "<div class=\"ui-widget\" id=\"announce_tips\" style=\"margin: 0px; position: fixed; top: 0px; width: 980px; z-index: 100;\">" +
		"	<div class=\"ui-state-highlight ui-corner-all\" style=\"padding: 3px .7em;\"> " +
		"		<p><span class=\"ui-icon ui-icon-info\" style=\"float: left; margin-right: .3em;\"></span>" + msg + "</p>" +
		"	</div>" +
		"</div>";
	fc = $(".z:first-child");
	fc.before(tips_str);
};

function insertFlash(elm, url, w, h) {
	if (!document.getElementById(elm)) return;
	var str = '<embed height="' + h + '" width="' + w + '" id="' + elm + '_flash" pluginspage="http://www.adobe.com/shockwave/download/download.cgi?P1_Prod_Version=ShockwaveFlash" allowscriptaccess="always" style="visibility:hidden"  src="' + url +
		'" type="application/x-shockwave-flash" allowfullscreen="true" quality="high">';
	document.getElementById(elm).innerHTML = str;
}
var cb_controler;

function cb_initOnlineInfo() {}

function cb_packet(index, data) {}

function cb_getOnline(online) {
	$("#wait_online").html(online);
}

function cb_chatlog(p1, p2, msg) {}

function cb_onconnect(cid, uid) {
	if (typeof(window.connect_cid) != "undefined") {
		setInterval(function() {
			cb_controler.getChatRoom();
		}, 30000);
	}
}

function cb_initok() {
	cb_controler.setConnectParam(window.connect_cid ? window.connect_cid : 1, __GetCookie("DedeUserID") ? __GetCookie("DedeUserID") : 0, "");
}
var scrollActivate = true;
/**
 * 回到页面顶部
 * @param acceleration 加速度
 * @param time 时间间隔 (毫秒)
 **/
function goTop(acceleration, time, callback) {
	if (!scrollActivate) {
		scrollActivate = true;
		return;
	}
	acceleration = acceleration || 0.1;
	time = time || 16;

	var x1 = 0;
	var y1 = 0;
	var x2 = 0;
	var y2 = 0;
	var x3 = 0;
	var y3 = 0;

	if (document.documentElement) {
		x1 = document.documentElement.scrollLeft || 0;
		y1 = document.documentElement.scrollTop || 0;
	}
	if (document.body) {
		x2 = document.body.scrollLeft || 0;
		y2 = document.body.scrollTop || 0;
	}
	var x3 = window.scrollX || 0;
	var y3 = window.scrollY || 0;

	// 滚动条到页面顶部的水平距离
	var x = Math.max(x1, Math.max(x2, x3));
	// 滚动条到页面顶部的垂直距离
	var y = Math.max(y1, Math.max(y2, y3));

	// 滚动距离 = 目前距离 / 速度, 因为距离原来越小, 速度是大于 1 的数, 所以滚动距离会越来越小
	var speed = 1 + acceleration;
	window.scrollTo(Math.floor(x / speed), Math.floor(y / speed));

	// 如果距离不为零, 继续调用迭代本函数
	if (x > 0 || y > 0) {
		var invokeFunction = "goTop(" + acceleration + ", " + time + ")";
		window.setTimeout(invokeFunction, time);
	} else {
		if (typeof(callback) != "undefined") {
			callback();
		}
	}
}

function loadNotify() {
	if ('http:' == document.location.protocol) {
		$("<div id=\"cb_controler\"></div>").appendTo("body");
		insertFlash("cb_controler", "http://static.hdslb.com/images/bili_notify.swf", 0, 0);
		cb_controler = $("#cb_controler_flash").get(0);
	}
}

var searchKW = "",
	lastPage = "";

function searchAT() {
	searchKW = $("#search_key").val();
	loadAT(1);
}

function loadAT(page) {
	var curPage = "/account/at/at-" + page + "?search=" + searchKW + "&att=" + ($(".ms-btn.addinfo").hasClass("on") ? 1 : 0) + "&r=" + Math.random();
	if (curPage == lastPage) return;
	lastPage = curPage;
	$("#atme.atlist > .loading").remove();
	$('<div class="loading"></div>').prependTo("#atme.atlist");
	var startTime = new Date();
	$.ajax(lastPage, {
		success: function(data) {
			var dur = new Date().getTime() - startTime.getTime();
			if (dur < 500) {
				setTimeout(function() {
					$("#atme.atlist").html(data);
					bindCardEvent();
				}, 300 - dur <= 0 ? 10 : 300 - dur);
			} else {
				$("#atme.atlist").html(data);
				bindCardEvent();
			}
		}
	});
}


function searchDyn() {
	searchKW = $("#search_key").val();
	loadDyn(1);
}

function loadDyn(page) {
	var curPage = "/account/dynamic/dyn-" + page + "?search=" + searchKW + "&fb=" + ($("#track_comment").hasClass("on") ? 1 : 0) + "&r=" + Math.random();
	if (curPage == lastPage) return;
	lastPage = curPage;
	$("#dynlist.atlist > .loading").remove();
	$('<div class="loading"></div>').prependTo("#dynlist.atlist");
	var startTime = new Date();
	$.ajax(lastPage, {
		success: function(data) {
			var dur = new Date().getTime() - startTime.getTime();
			if (dur < 500) {
				setTimeout(function() {
					$("#dynlist.atlist").html(data);
					bindCardEvent();
				}, 300 - dur <= 0 ? 10 : 300 - dur);
			} else {
				$("#dynlist.atlist").html(data);
				bindCardEvent();
			}
		}
	});
}
