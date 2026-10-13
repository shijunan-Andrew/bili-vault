{
  return (globalThis._wb_wombat && globalThis._wb_wombat.local_init && globalThis._wb_wombat.local_init(name))||globalThis[
    name
  ];
  
};
if(!globalThis.__WB_pmw){
  globalThis.__WB_pmw=function(obj){
    this.__WB_source=obj;
    return this;
    
  }
}{
  
let window = _____WB$wombat$assign$function_____("window");
  
let self = _____WB$wombat$assign$function_____("self");
  
let document = _____WB$wombat$assign$function_____("document");
  
let location = _____WB$wombat$assign$function_____("location");
  
let top = _____WB$wombat$assign$function_____("top");
  
let parent = _____WB$wombat$assign$function_____("parent");
  
let frames = _____WB$wombat$assign$function_____("frames");
  
let opener = _____WB$wombat$assign$function_____("opener");
  
(function(){
    function b(){
      $.getJSON("/index/ding-count.json",
      function(d){
        window.pushData=d;
        for(var e=0;
        e<window.pushRefreshFunctions.length;
        e++){
          window.pushRefreshFunctions[
            e
          ](d)
        }
      })
    }window.pushRefreshFunctions=[
      
    ];
    b();
    window.pushTimer=setInterval(b,
    5000)
  })();
  var lazyImage=new LazyImage,
  AjaxQueue=function(){
    function b(){
      this.queue={
        
      };
      this.cache=[
        
      ]
    }b.prototype.ajax=function(d){
      var g=this;
      if(!this.push($.extend({
        
      },
      d))){
        if($.extend(d,
        {
          success:function(j,
          i,
          c){
            g.cache[
              d.url
            ]=j;
            for(var a;
            a=g.queue[
              d.url
            ].shift();
            ){
              a.success.apply(this,
              arguments)
            }
          },
          error:function(j,
          i,
          c){
            for(var a;
            a=g.queue[
              d.url
            ].shift();
            ){
              a.error.apply(this,
              arguments)
            }
          }
        }),
        d.useBuffer&&this.cache[
          d.url
        ]){
          for(var e;
          e=this.queue[
            d.url
          ].shift();
          ){
            e.success(this.cache[
              d.url
            ])
          }
        }else{
          $.ajax(d)
        }
      }
    };
    b.prototype.push=function(c){
      this.queue[
        c.url
      ]=this.queue[
        c.url
      ]||[
        
      ];
      this.queue[
        c.url
      ].push(c);
      return 1<this.queue[
        c.url
      ].length?!0:!1
    };
    return b
  }();
  function fixImg(b){
    b.each(function(d,
    g){
      var e=$(g);
      2>=Math.abs(180-e.width())&&180!=e.width()&&e.css("width",
      180)
    })
  }function setSubscribe(j,
  i,
  p,
  m){
    function o(){
      window.biliLoginStatus.isLogin?(0<=$.inArray(-i,
      window.AttentionList)&&j.addClass(p).html("\u5df2\u8ba2"),
      j.click(function(){
        var b=$(this);
        b.hasClass(p)?l(b,
        i):n(b,
        i)
      }),
      j.hover(function(){
        $(this).hasClass(p)&&$(this).html("\u53d6\u6d88")
      },
      function(){
        $(this).hasClass(p)&&$(this).html("\u5df2\u8ba2")
      })):j.remove()
    }function n(d,
    c){
      $.ajax("/spadmin?action=attention&spid="+c,
      {
        success:function(a){
          "OK"==a?"undefined"!=typeof m?m(a):d.addClass(p).html("\u5df2\u8ba2"):(new MessageBox).show(d,
          a)
        },
        error:function(){
          (new MessageBox).show(d,
          "\u7f51\u7edc\u9519\u8bef")
        }
      })
    }function l(d,
    c){
      $.ajax("/spadmin?action=unfavourite&spid="+c,
      {
        success:function(a){
          "OK"==a?"undefined"!=typeof m?m(a):d.removeClass(p).html("\u8ba2\u9605"):(new MessageBox).show(d,
          a)
        },
        error:function(){
          (new MessageBox).show(d,
          "\u7f51\u7edc\u9519\u8bef")
        }
      })
    }var k=setInterval(function(){
      "undefined"!=typeof window.biliLoginStatus&&(clearInterval(k),
      o())
    },
    200)
  }function CreateArea(e){
    this.DEFAULT_PARAMS={
      AREA:'<div class="container-row"><div class="b-l"><div class="b-head"></div><div class="b-body"></div></div><div class="b-r"><div class="b-head"></div><div class="b-body"></div></div></div>'
    };
    this.api={
      
    };
    this.params={
      tid:null,
      container:null,
      area:this.DEFAULT_PARAMS.AREA,
      id:null,
      name:null,
      empty:!1,
      wrapper:null,
      addFunc:null,
      panes:null
    };
    this.mergeParams(this.params,
    e);
    var d=!1;
    this.area=$(this.params.area);
    null!=e.id&&(0<$("#"+e.id).length?(this.area=$("#"+e.id),
    d=!0):this.area.attr("id",
    e.id));
    e.empty&&this.area.empty();
    var f;
    e.wrapper?(this.area.attr("part",
    ""),
    f=0<$("#"+e.wrapper).length?$("#"+e.wrapper):$('<div class="container-row cnt-m"></div>').attr("id",
    e.wrapper),
    d||this.area.appendTo(f)):f=this.area;
    "undefined"==typeof f.attr("area")&&f.attr("area",
    "");
    d||(e.addFunc?e.addFunc(f):f.appendTo($(e.container)))
  }CreateArea.createTab=function(d,
  c){
    c=c||{
      
    };
    "undefined"!=typeof c.selected?d.items[
      c.selected
    ].selected=!0:d.items[
      0
    ].selected=!0;
    "undefined"!=typeof c.wrapper&&(d.wrapper=c.wrapper);
    return{
      element:TabModule.create(d)
    }
  };
  CreateArea.createRankingTab=function(b){
    return CreateArea.createTab({
      items:[
        {
          name:"\u5168\u90e8",
          attributes:{
            type:"hot"
          }
        },
        {
          name:"\u539f\u521b",
          attributes:{
            type:"hot_original"
          }
        }
      ]
    },
    b)
  };
  CreateArea.createListTab=function(b){
    return CreateArea.createTab({
      items:[
        {
          name:"\u6709\u65b0\u52a8\u6001",
          attributes:{
            "data-source":"/index/ding.json"
          }
        },
        {
          name:"\u6700\u65b0\u6295\u7a3f",
          attributes:{
            "data-source":"/index/ranking.json"
          }
        }
      ]
    },
    b)
  };
  CreateArea.createSelect=function(d,
  c){
    c=c||{
      
    };
    "undefined"!=typeof c.selected?d.items[
      c.selected
    ].selected=!0:d.items[
      0
    ].selected=!0;
    "undefined"!=typeof c.wrapper&&(d.wrapper=c.wrapper);
    return{
      element:SelectModule.create(d)
    }
  };
  CreateArea.createRankingSelect=function(e,
  d){
    var f=[
      {
        name:"\u4e09\u65e5",
        attributes:{
          "data-source":"/index/catalogy/"+e+"-3day.json"
        }
      },
      {
        name:"\u4e00\u5468",
        attributes:{
          "data-source":"/index/catalogy/"+e+"-week.json"
        }
      }
    ];
    "undefined"!=typeof d&&d.month&&f.push({
      name:"\u4e00\u6708",
      attributes:{
        "data-source":"/index/catalogy/"+e+"-month.json"
      }
    });
    return CreateArea.createSelect({
      items:f
    },
    d)
  };
  CreateArea.prototype={
    loadingDiv:'<div class="b-loading p-loading" loading></div>',
    data:{
      
    },
    queue:[
      
    ],
    panes:[
      
    ],
    bangumiDataBuffer:null,
    complete:!1,
    debug:!1,
    mergeParams:function(e,
    d){
      if("object"==typeof d){
        for(var f in e){
          d.hasOwnProperty(f)&&(e[
            f
          ]=d[
            f
          ])
        }return e
      }
    },
    init:function(){
      if("object"==typeof this.params.panes){
        for(var e in this.params.panes){
          var d=this.mergeParams({
            _super:this,
            tid:null,
            template:null,
            templateTarget:null,
            wrapper:null,
            headClass:".b-head",
            bodyClass:".b-body",
            title:null,
            tab:null,
            tabTarget:null,
            tabChange:this.tabChange,
            selector:null,
            selectorTarget:null,
            selectChange:this.selectChange,
            push:!1,
            sliderParams:null,
            onInitComplete:null,
            dataContainer:null,
            api:null,
            dataSource:null,
            TYPES:null,
            type:null,
            pagesize:null,
            renderBefore:this.renderBefore,
            render:null,
            renderComplete:this.renderComplete
          },
          this.params.panes[
            e
          ]);
          this.onInit(d);
          if(null!=d.template){
            if(1<$(d.template).length){
              var f=$(d.template);
              d.template=$("<div temp-wrapper></div>").append(f)
            }else{
              d.template=$(d.template)
            }d.templateTarget?d.template.appendTo(this.area.find(d.templateTarget)):d.template.appendTo(this.area)
          }else{
            d.template=this.area
          }d.wrapper=null!=d.wrapper?$(d.wrapper,
          d.template):d.template;
          d.body=d.wrapper.find(d.bodyClass);
          0==d.body.length&&(d.body=d.wrapper);
          d.head=d.wrapper.find(d.headClass);
          d.title&&d.head.html(d.title);
          null!=d.dataContainer&&"object"!=typeof d.dataContainer?d.dataContainer=$(d.dataContainer).appendTo(d.body):null==d.dataContainer&&(d.dataContainer=d.body);
          "undefined"!=typeof f&&d.template.children().unwrap("[temp-wrapper]");
          d.selector&&this.initSelector(d);
          d.tab&&this.initTab(d);
          d.push&&this.initPush(d);
          if(d.onInitComplete){
            d.onInitComplete(d)
          }this.params.panes[
            e
          ]=d;
          this.panes.push(d)
        }
      }
    },
    _callFunc:function(d,
    c){
      if("string"==typeof d){
        this[
          d
        ](c)
      }else{
        "function"==typeof d&&d.call(this,
        c)
      }
    },
    onInit:function(b){
      "renderHot"!=b.render&&"renderIndexRanking"!=b.render||!b.tab||(b.renderBefore="renderHotBefore",
      b.tabChangeCallback="renderHotTabChange",
      b.selectChangeCallback="renderHotSelectChange")
    },
    initTab:function(e){
      var d=this;
      if("object"!=typeof e.tab){
        var f=$(e.tab).appendTo(e.wrapper.find(e.tabTarget));
        e.tab=f
      }else{
        e.tab instanceof $||(e.tab=e.tab.element,
        e.tab.appendTo(e.wrapper.find(e.tabTarget)))
      }d.callTabChange(e,
      !1);
      !0===e.push&&e.tab.children().first().attr("push",
      "");
      bindTab({
        item:e.tab,
        onChange:function(){
          e.selector?d.callTabChange(e,
          !1):d.callTabChange(e,
          !0);
          e.selector&&d.callSelectChange(e,
          !0,
          !1)
        }
      })
    },
    initSelector:function(e){
      var d=this;
      if("object"!=typeof e.selector){
        var f=$(e.selector).appendTo(e.wrapper.find(e.selectorTarget));
        e.selector=f
      }else{
        e.selector instanceof $||(e.selector=e.selector.element,
        e.selector.appendTo(e.wrapper.find(e.selectorTarget)))
      }bindSlt({
        item:e.selector,
        onChange:function(){
          d.callSelectChange(e,
          !0)
        }
      });
      d.callSelectChange(e,
      !1)
    },
    callTabChange:function(e,
    d,
    f){
      if("function"==typeof e.tabChange){
        e.tabChange(e)
      }else{
        if("string"==typeof e.tabChange){
          this[
            e.tabChange
          ](e)
        }
      }e.tabChangeCallback&&!1!==f&&this._callFunc(e.tabChangeCallback,
      e);
      d&&this.parseData(e)
    },
    tabChange:function(d){
      var c=d.tab.find("li.on");
      c.attr("data-source")?d.dataSource=c.attr("data-source"):d.api&&d.api.selectby&&(d.api.data[
        d.api.selectBy
      ]=c.attr(d.api.selectBy));
      c.attr("type")&&(c=c.attr("type"),
      d.type=null!=d.TYPES?d.TYPES[
        c
      ]||c:c)
    },
    callSelectChange:function(e,
    d,
    f){
      if("function"==typeof e.selectChange){
        e.selectChange(e)
      }else{
        if("string"==typeof e.selectChange){
          this[
            e.selectChange
          ](e)
        }
      }e.selectChangeCallback&&!1!==f&&this._callFunc(e.selectChangeCallback,
      e);
      d&&this.parseData(e)
    },
    selectChange:function(d){
      var c=d.selector.find("li[selected]");
      c.attr("data-source")?d.dataSource=c.attr("data-source"):d.api&&d.api.selectby&&(d.api.data[
        d.api.selectBy
      ]=c.attr(d.api.selectBy));
      c.attr("type")&&(c=c.attr("type"),
      d.type=null!=d.TYPES?d.TYPES[
        c
      ]||c:c)
    },
    initPush:function(i){
      var h=this,
      n=i.pushContainer=$('<div class="read-push"><span class="icon-refresh"></span><span class="info"></span></div>').appendTo(i.head).hide(),
      k=i.tid||h.params.tid||0;
      i.lastPush=i.currentPush=0;
      var m="undefined"!=typeof window.pushTimer?!0:!1;
      if(m){
        var l=function(a){
          i.currentPush=a[
            k
          ];
          a=i.currentPush-i.lastPush;
          0<a&&n.show().find(".info").html("<em>\u6709</em><b>"+a+"</b><em>\u6761\u65b0\u52a8\u6001\uff01\u70b9\u51fb\u5237\u65b0</em>")
        };
        if("undefined"!=typeof window.pushData){
          i.lastPush=window.pushData[
            k
          ],
          window.pushRefreshFunctions.push(l)
        }else{
          var j=setInterval(function(){
            "undefined"!=typeof window.pushData&&(clearInterval(j),
            i.lastPush=window.pushData[
              k
            ],
            window.pushRefreshFunctions.push(l))
          },
          100)
        }
      }else{
        n.show().find(".info").html("\u70b9\u51fb\u5237\u65b0")
      }n.click(function(){
        i.lastPush=i.currentPush;
        m&&(n.hide(),
        n.find(".info").html(""));
        i.dataSource="/index/ding/"+k+".json";
        null!=i.tab&&i.tab.find('[data-source="/index/ding.json"]').attr("data-source",
        i.dataSource);
        i.tab&&(i.tab.children().removeClass("on"),
        i.tab.find("[push]").addClass("on"));
        h.parseData(i,
        !0)
      })
    },
    initApi:function(e){
      var d;
      if(null!=e.api){
        d=this.api[
          e.api.name
        ];
        if(e.api.data){
          d.data||(d.data={
            
          });
          for(var f in e.api.data){
            d.data[
              f
            ]=e.api.data[
              f
            ]
          }
        }e.pagesize&&e.api.data&&(d.data.pagesize=e.pagesize)
      }else{
        d=null!=e.dataSource?e.dataSource:null
      }return d
    },
    makeQueryString:function(e){
      if(null==e||"string"==typeof e){
        return e
      }var d=e.url+"?",
      h=0,
      g;
      for(g in e.data){
        e.data[
          g
        ]&&(d+=(0==h?"":"&")+g+"="+e.data[
          g
        ],
        h++)
      }return d
    },
    load:function(e){
      for(var d in e){
        var f=e[
          d
        ];
        null!=f.render&&this.parseData(f)
      }this.complete=!0
    },
    parseData:function(g,
    e){
      var j=this;
      j._callFunc(g.renderBefore,
      g);
      j.renderReadMore(g);
      var h=j.initApi(g);
      g.loadingDiv=$(j.loadingDiv).prependTo(g.dataContainer);
      if("object"==typeof h){
        j.render(h)
      }else{
        var i=j.makeQueryString(h);
        if(null!=i){
          if(j.data[
            i
          ]&&!0!==e){
            g.loadingDiv.remove(),
            j.render(g,
            j.data[
              i
            ])
          }else{
            j.queue[
              i
            ]=j.queue[
              i
            ]||[
              
            ];
            j.queue[
              i
            ].push({
              pane:g,
              callback:function(a){
                a.code&&0!=a.code||(g.loadingDiv.remove(),
                j.render(g,
                a))
              }
            });
            if(1<j.queue[
              i
            ].length){
              return !1
            }setTimeout(function(){
              $.ajax({
                url:i,
                dataType:"json",
                success:function(d){
                  j.data[
                    i
                  ]=d;
                  for(var c;
                  c=j.queue[
                    i
                  ].shift();
                  ){
                    c.callback(d)
                  }
                },
                error:function(){
                  for(var b;
                  b=j.queue[
                    i
                  ].shift();
                  ){
                    b.pane.loadingDiv.removeClass("b-loading").html("\u52a0\u8f7d\u5931\u8d25")
                  }
                }
              })
            },
            j.debug?2000:0)
          }
        }
      }
    },
    render:function(e,
    d){
      try{
        if("function"==typeof e.render){
          e.render(e,
          d)
        }else{
          if("string"==typeof e.render){
            this[
              e.render
            ](e,
            d)
          }
        }
      }catch(f){
        
      }this._callFunc(e.renderComplete,
      e)
    },
    lazyImage:lazyImage,
    renderBefore:function(b){
      b.dataContainer.empty()
    },
    renderReadMore:function(e){
      var d=$("<div>").addClass("more-link"),
      h=$("<a>").html("\u67e5\u770b\u66f4\u591a&gt;").appendTo(d),
      g=e.dataContainer;
      0==e.wrapper.find(".more-link").length&&!1!==e.readmore&&("renderList"==e.render?h.attr("href",
      "/video/"+this.params.name+".html"):"renderSubList"==e.render?"undefined"!=typeof this.area.find(".b-l .b-head-t a").attr("href")?h.attr("href",
      this.area.find(".b-l .b-head-t a").attr("href")):g=null:"renderIndexRanking"==e.render?(h.attr({
        href:"/list/rank-"+this.params.name+".html#order=hot&page=1&range="+imod_box_get3d_date(),
        target:"_blank"
      }),
      0<e.dataContainer.parents(".r-list-body").length&&(g=e.dataContainer.parents(".r-list-body"))):"renderSubRanking"==e.render?(e=this.area.find(".b-l .b-head-t a").attr("href"),
      e="undefined"==typeof e?"/list/rank-"+this.params.name+".html#order=hot&page=1&range="+imod_box_get3d_date():e+"#hot,1,"+imod_box_get3d_date(),
      h.attr("href",
      e)):g=null,
      null!=g&&d.insertAfter(g))
    },
    renderComplete:function(e){
      var d=e._super,
      f=e.dataContainer;
      "undefined"!=typeof e.swifting&&!1!=e.swifting||d.lazyImage.lazy(f,
      function(b){
        2>=Math.abs(160-b.width())&&160!=b.width()&&b.css("width",
        160)
      });
      0==f.children().length&&(f[
        0
      ]&&f[
        0
      ].tagName&&"UL"==f[
        0
      ].tagName?$('<li class="no-data">\u6ca1\u6709\u6570\u636e</li>').appendTo(f):$('<div class="no-data">\u6ca1\u6709\u6570\u636e</div>').appendTo(f));
      bindPOCoins2(e.dataContainer.find(".v"));
      $(".v .i .i1, .v .i .i2, #dianji, .w_info .gk, .w_info .sc, .w_info .dm, .rlist .i .c1, .rlist .i .c2").html(function(){
        return formatFriendlyNumber($(this).html())
      })
    },
    renderList:function(g,
    e){
      var j;
      j=null!=g.type?"undefined"!=typeof e.newv&&"newv"!=g.type?"undefined"!=typeof e.newv[
        g.type
      ]?e.newv[
        g.type
      ].list:{
        
      }:"undefined"!=typeof e[
        g.type
      ]?e[
        g.type
      ].list||e[
        g.type
      ]:e.list||e:e.list||e;
      for(var h=g.pagesize?g.pagesize:j.length,
      i=0;
      i<h;
      i++){
        "undefined"!=typeof j[
          i
        ]&&$('<li><div class="v" gk="'+j[
          i
        ].play+'" sc="'+j[
          i
        ].favorites+'" pl="'+j[
          i
        ].review+'" dm="'+j[
          i
        ].video_review+'" up="'+j[
          i
        ].author+'" subtitle="'+j[
          i
        ].subtitle+'" lm="'+j[
          i
        ].typename+'" tg="'+j[
          i
        ].create+'" txt="'+j[
          i
        ].description.replace(/"/g,"''")+'" yb="'+j[i].coins+'"><a class="preview" href="/video/av'+j[i].aid+'/" target="_blank" title="'+j[i].title+'"><div class="medal"></div><div class="original"></div><div class="border"></div><img data-img="'+j[i].pic+'" alt="'+j[i].title+'"><div class="x"><b class="x2">'+j[i].duration+'</b></div></a><a href="/video/av'+j[i].aid+'/" target="_blank" title="'+j[i].title+'"><div class="t">'+j[i].title+'</div><div class="i"><b class="i1">'+j[i].play+'</b><b class="i2">'+j[i].video_review+"</b></div></a></div></li>").appendTo(g.dataContainer)}},renderSubList:function(d,c){c instanceof $?d.dataContainer.html(c.html()):this.renderList(d,c)},renderHot:function(h,g){if(!h.dataContainer.attr("loaded")){var l;l=null!=h.type?g[h.type].list:g.list||g;for(var i=h.pagesize?h.pagesize:l.length,k=0;k<i;k++){if("undefined"!=typeof l[k]){var j='<li gk="'+l[k].play+'" sc="'+l[k].favorites+'" pl="'+l[k].review+'" dm="'+l[k].video_review+'" up="'+l[k].author+'" subtitle="'+l[k].subtitle+'" lm="'+l[k].typename+'" tg="'+l[k].create+'" txt="'+l[k].description.replace(/"/g,
        "''")+'" yb="'+l[
          k
        ].coins+'"><div class="r-item"><div class="preview"><a href="/video/av'+l[
          k
        ].aid+'/" target="_blank" title="'+l[
          k
        ].title+'"><img data-img="'+l[
          k
        ].pic+'" alt="'+l[
          k
        ].title+'" /></a></div><a href="/video/av'+l[
          k
        ].aid+'/" target="_blank" title="'+l[
          k
        ].title+'"><p class="t">'+l[
          k
        ].title+"</p></a></div></li>";
        $(j).appendTo(h.dataContainer)
      }
    }h.tab&&h.dataContainer.attr("loaded",
    "true");
    0==h.wrapper.find(".more-link").length&&$('<div class="more-link"><a href="/list/rank-'+this.params.name+".html#order=hot&page=1&range="+imod_box_get3d_date()+'" target="_blank">\u67e5\u770b\u66f4\u591a&gt;</a></div>').insertAfter(h.dataContainer);
    bindPOCoins2(h.dataContainer.find("li"))
  }
},
renderHotBefore:function(b){
  b.body.hasClass("rb")||b.body.addClass("rb");
  b.wrapper.find(".rlist[loaded]").length==b.tab.children().length&&(b.swifting=!0);
  b.wrapper.find(".rlist").length<b.tab.children().length&&$('<ul class="rlist"></ul>').appendTo(b.wrapper.find(".r-list-wrapper"));
  b.dataContainer=b.wrapper.find(".rlist:eq("+b.tab.find(".on").index()+")")
},
renderHotTabChange:function(b){
  b.dataContainer.parents(".r-list-wrapper").css("margin-left",
  -100*b.tab.find(".on").index()+"%")
},
renderHotSelectChange:function(b){
  b.wrapper.find(".rlist").empty().removeAttr("loaded");
  b.swifting=!1
},
renderRanking:function(i,
h,
n,
k){
  h=null!=i.type?h[
    i.type
  ].list:h.list||h;
  for(var m=i.pagesize?i.pagesize:h.length,
  l=0;
  l<m;
  l++){
    if("undefined"!=typeof h[
      l
    ]){
      var j=$('<li gk="'+h[
        l
      ].play+'" sc="'+h[
        l
      ].favorites+'" pl="'+h[
        l
      ].review+'" dm="'+h[
        l
      ].video_review+'" up="'+h[
        l
      ].author+'" subtitle="'+h[
        l
      ].subtitle+'" lm="'+h[
        l
      ].typename+'" tg="'+h[
        l
      ].create+'" txt="'+h[
        l
      ].description.replace(/"/g,"''")+'" yb="'+h[l].coins+'"><i class="number">'+(l+1)+'</i><div class="preview"><a href="/video/av'+h[l].aid+'/" title="'+h[l].title+" \u64ad\u653e:"+h[l].play+" "+h[l].duration+'" target="_blank"><img data-img="'+h[l].pic+'" alt="'+h[l].title+'" /></a></div><a href="/video/av'+h[l].aid+'/" title="'+h[l].title+" \u64ad\u653e:"+h[l].play+" "+h[l].duration+'" target="_blank"><div class="title t">'+h[l].title+'</div><div class="i"><b class="c1">'+h[l].play+'</b><b class="c2">'+h[l].video_review+"</b></div></a></li>");"undefined"!=typeof n&&n(j,l);j.appendTo(i.dataContainer)}}bindPOCoins2(i.dataContainer.find("li"));"undefined"!=typeof k&&k(i)},renderIndexRanking:function(d,c){d.dataContainer.attr("loaded")||this.renderRanking(d,c,function(f,e){1>e?f.addClass("on"):f.addClass("off");3>e&&f.find(".number").addClass("n"+(e+1))},function(b){b.tab&&b.dataContainer.attr("loaded","true")})},renderSubRanking:function(d,c){this.renderRanking(d,c,function(f,e){3>e?f.addClass("on"):f.addClass("off");3>e&&f.find(".number").addClass("n"+(e+1))})},renderTopList:function(h,g){g=g.recommend||g;for(var l=g.list,i=h.pagesize?h.pagesize:l.length,k=0;k<i;k++){var j=l[k];"undefined"!=typeof j&&$('<li><div class="v-item" gk="'+j.play+'" sc="'+j.favorites+'" pl="'+j.review+'" dm="'+j.video_review+'" up="'+j.author+'" subtitle="'+j.subtitle+'" lm="'+j.typename+'" tg="'+j.create+'" txt="'+j.description.replace(/"/g,
      "''")+'" yb="'+j.coins+'"><a href="/video/av'+j.aid+'/" target="_blank" title="'+j.title+'"><div class="medal"></div><div class="original"></div><div class="preview"><img data-img="'+j.pic+'" alt="'+j.title+'" /></div><div class="mask"></div><div class="play-icon"></div><div class="info"><div class="t">'+j.title+'</div><p class="up">up\u4e3b\uff1a'+j.author+'</p><p class="play">\u64ad\u653e\uff1a'+j.play+"</p></div></a></div></li>").appendTo(h.dataContainer)
    }
  },
  renderAds:function(i,
  h){
    var n=h.item;
    if(h.zone.enabled){
      for(var k=i.pagesize?i.pagesize:n.length,
      m=0;
      m<k;
      m++){
        var l=n[
          m
        ];
        if("undefined"!=typeof l){
          var j=$('<div class="pmt-item"><a href="'+l.link+'" target="_blank"><img src="'+l.image+'"></a></div>').appendTo(i.dataContainer);
          1!=l.width&&j.addClass("pmt-mid")
        }
      }
    }else{
      i.dataContainer.remove()
    }
  },
  renderSubRecommend:function(r,
  q){
    function p(a){
      if("undefined"!=typeof a){
        var f=null;
        switch(a.type){
          case"sp":f=$('<div class="r-item"><a href="/sp/'+a.title+'" target="_blank" title="'+a.title+'"><img data-img="'+a.image+'" class="img" alt="'+a.title+'" /></a><div class="i-r"><a class="t" href="/sp/'+a.title+'" title="'+a.title+'" target="_blank">'+a.title+"</a></div></div>");
          f.attr("spid",
          a.spid);
          a=a.spid;
          var e=$('<div class="b-btn">\u8ba2\u9605</div>').appendTo(f.find(".i-r"));
          setSubscribe(e,
          a,
          "disabled");
          break;
          case"pic":r.dataContainer.addClass("ad"),
          f=$('<div class="r-item-ad"><a href="'+a.link+'" target="_blank" title="'+a.title+'"><img data-img="'+a.image+'" alt="'+a.title+'" /></div>'),
          a=parseInt(a.width),
          6>=a&&0!=a&&(f.addClass("w"+a),
          1==a&&0==r.dataContainer.find(".hidden").length&&f.addClass("hidden"))
        }f.appendTo(r.dataContainer)
      }
    }function m(){
      function a(){
        s.show();
        g.show();
        1>=d?s.hide():d>=h&&g.hide();
        r.dataContainer.html("");
        for(var b=j*(d-1);
        b<(j*d<l?j*d:l);
        b++){
          p(o[
            b
          ])
        }r.dataContainer.css({
          opacity:0
        });
        r.dataContainer.animate({
          opacity:1
        },
        200)
      }var h=Math.ceil(l/j),
      d=1,
      c=r.dataContainer.parent(),
      s=$('<div class="prev"><span></span></div>').appendTo(c).hide(),
      g=$('<div class="next"><span></span></div>').appendTo(c);
      s.click(function(){
        1>=d||(d--,
        a())
      });
      g.click(function(){
        d>=h||(d++,
        a())
      })
    }var o=q.item;
    if(q.zone.enabled){
      var n=r.pagesize?r.pagesize:-1,
      l=0,
      j=5;
      r.dataContainer.wrap('<div class="b-rm-list-wrapper"></div>');
      for(var i=0;
      i<o.length&&!(-1!=n&&i>=n);
      i++){
        i<j&&p(o[
          i
        ]),
        l++
      }l>j&&m()
    }else{
      r.template.remove()
    }
  },
  renderEndedBangumiPromote:function(j,
  i){
    var p=i.item;
    if(i.zone.enabled){
      for(var m=j.pagesize?j.pagesize:-1,
      o=0;
      o<p.length;
      o++){
        var n=p[
          o
        ];
        if(-1!=m&&o>=m){
          break
        }if("undefined"!=typeof n&&"object"==typeof n){
          var l="",
          k="";
          switch(n.type){
            case"sp":l=n.index_cover;
            k='<p class="num">\u5168'+n.episode_count+"\u8bdd</p>";
            break;
            case"topic":l=n.image;
            k='<p class="num">\u8bdd\u9898</p>';
            break;
            case"video":l=n.image,
            k=""
          }(2>o?$('<li class="ipt"><div class="r-item"><a href="/sp/'+n.title+'" target="_blank" title="'+n.title+'"><div class="preview"><img data-img="'+l+'" alt="'+n.title+'" />'+k+'</div><p class="t"><span>'+n.title+'</span></p></a><p class="play">\u603b\u64ad\u653e\uff1a'+formatFriendlyNumber(n.video_view.toString())+"</p></div></li>"):$('<li><div class="r-item"><a class="preview" href="/sp/'+n.title+'" target="_blank" title="'+n.title+'"><img data-img="'+n.image+'" alt="'+n.title+'" /></a><div class="r-i"><a href="/sp/'+n.title+'" target="_blank" title="'+n.title+'"><p class="t"><span>'+n.title+"</span></p></a>"+k+"</div></div></li>")).appendTo(j.dataContainer)
        }
      }
    }
  },
  renderBangumiCalendar:function(j,
  i){
    function p(a){
      $("<li"+(a[
        "new"
      ]?' class="new"':"")+'><div class="c-item"><a class="preview" href="/sp/'+a.title+'" target="_blank" title="'+a.title+'"><img data-img="'+a.cover+'" alt="'+a.title+'" /></a><div class="r-i"><a href="/sp/'+a.title+'" target="_blank" title="'+a.title+'"><p class="t"><span>'+a.title+'</span></p></a><p class="num">\u66f4\u65b0\u81f3<span>'+a.bgmcount+"\u8bdd</span></p></div></div></li>").appendTo(j.dataContainer)
    }var m=j.tab.find("li.on").attr("day");
    j.dataContainer.addClass("custom-scrollbar");
    if(null==this.bangumiDataBuffer){
      this.bangumiDataBuffer={
        
      };
      for(var o=i.list||i,
      n=j.pagesize&&j.pagesize>=o.length?j.pagesize:o.length,
      l=0;
      l<n;
      l++){
        "undefined"==typeof this.bangumiDataBuffer[
          o[
            l
          ].weekday
        ]&&(this.bangumiDataBuffer[
          o[
            l
          ].weekday
        ]=[
          
        ]),
        this.bangumiDataBuffer[
          o[
            l
          ].weekday
        ].push(o[
          l
        ])
      }for(var k in this.bangumiDataBuffer){
        this.bangumiDataBuffer[
          k
        ].sort(function(d,
        c){
          return c.video_view-d.video_view
        })
      }
    }for(o=0;
    o<this.bangumiDataBuffer[
      m
    ].length;
    o++){
      p(this.bangumiDataBuffer[
        m
      ][
        o
      ])
    }$(".c-bottom",
    j.wrapper).remove();
    j.dataContainer.css({
      opacity:0
    });
    j.dataContainer.animate({
      opacity:1
    },
    200);
    $('<div class="c-bottom clearfix"><div class="more-link right"><a class="gobgm" href="/video/bgm_calendar.html" target="_blank">\u65b0\u756a\u653e\u9001\u8868></a></div></div>').insertAfter(j.dataContainer)
  },
  renderRecommend:function(h,
  g){
    var l=g.list,
    i;
    for(i in l){
      var k=l[
        i
      ];
      if("object"==typeof k){
        var j=k.last_recommend[
          0
        ];
        $('<li><div class="rm-item"><a class="face" card="'+j.uname+'" href="http://web.archive.org/web/20150630082746/http://space.bilibili.com/'+j.mid+'" target="_blank"><img data-img="'+j.face+'"></a><a class="name" card="'+j.uname+'" href="http://web.archive.org/web/20150630082746/http://space.bilibili.com/'+j.mid+'" target="_blank">'+j.uname+'</a><span>\u63a8\u8350</span><a class="preview" href="/video/av'+k.aid+'/" target="_blank" title="'+k.title+'"><img data-img="'+k.pic+'" alt="'+k.title+'" /><p class="t">'+k.title+"</p></a></div></li>").appendTo(h.dataContainer)
      }
    }
  },
  renderPromote:function(j,
  i){
    var p=i.list,
    m=j.pagesize?j.pagesize:p.length,
    o=0,
    n;
    for(n in p){
      var l=p[
        n
      ];
      if("undefined"!=typeof l&&p.hasOwnProperty(n)){
        var k=$('<li><div class="v" gk="'+l.play+'" sc="'+l.favorites+'" pl="'+l.review+'" dm="'+l.video_review+'" up="'+l.author+'" subtitle="'+l.subtitle+'" lm="'+l.typename+'" tg="'+l.create+'" txt="'+l.description.replace(/"/g,"''")+'" yb="'+l.coins+'"><a class="preview" href="/video/av'+l.aid+'/?tg" target="_blank" title="'+l.title+'"><div class="border"></div><img data-img="'+l.pic+'" alt="'+l.title+'" /><div class="x"><b class="x2">'+l.duration+'</b></div></a><a href="/video/av'+l.aid+'/?tg" target="_blank" title="'+l.title+'"><div class="t">'+l.title+"</div></a></div></li>");l.ads&&$("<div>").addClass("ads").html("\u5e7f\u544a").appendTo(k.find(".preview"));k.appendTo(j.dataContainer);o++;if(o>=m){break}}}}};var ModuleManage={pageModules:[],lazyQueue:[],pageBlocks:{},delayTimer:null,load:function(z,y){var x=this,u={},w={},v=[];if("undefined"!=typeof y&&"undefined"!=typeof y.nav){var t=y.nav,v=t.seq}for(var s=this.sort(z,v),p=0;p<s.length;p++){var o=s[p],n=o.params,o=o.name;if("undefined"!=typeof y){for(var i in y){n[i]=y[i]}}n=this.create(o,n);v&&0<v.length&&this.insert(s,p);u[o]=w[o]=n}"undefined"!=typeof t&&t.setPosition();var j=this.pageModules.push(u)-1;this.lazyQueue.push(w);this.lazy(w,j,t);$(window).on("scroll.lazyPage_"+j,function(){x.lazy(w,j,t)});return u},create:function(e,d){d=d||{};d.name=d.name||e;var f=d.create?d.create:new CreateArea(d);f.init();return this.pageBlocks[e]=f},sort:function(i,h){var n=[],k=0,m=0,l;for(l in i){var j=null;0>$.inArray(l,h)?m++:j=$.inArray(l,h);n.push({name:l,index:null!=j?j+m:k,seq:j,params:i[l]});k++}if(h&&0<h.length){for(n.sort(function(d,c){return d.index-c.index}),k=0;k<n.length;k++){this.insert(n,k)}}return n},insert:function(e,d){var f=e[d];f.seq&&(0<f.index&&f.params.area&&f.params.area.length)&&f.params.area.insertAfter(e[f.index-1].params.area)},lazy:function(g,e,j){var h=this;clearTimeout(this.delayTimer);var i=arguments;this.delayTimer=function(){setTimeout(function(){if("undefined"==typeof j||1!=j.scrolling){if(1>=i.length){for(var a=0;a<h.lazyQueue.length;a++){h._lazy(h.lazyQueue[a],a)}}else{h._lazy(g,e)}}},10)}()},_lazy:function(e,d){if(e){var h=$(window).height()/2,g=0;$.each(e,function(a,c){$(window).scrollTop()+h>=c.area.offset().top-$(window).height()&&$(window).scrollTop()-h<=c.area.offset().top+c.area.height()&&!c.complete?(c.create?c.create(c.params.dataSource):c.load(c.params.panes),delete e[a]):c.complete&&delete e[a];g++});0==g&&(e=null,this.lazyQueue[d]=null,$(window).off("scroll.lazyPage_"+d))}}};function createBanner(d){d=parseInt(d);var c={parent:".container-top .b-topic",wrapper:$('<div class="topic-preview-wrapper"><div class="s-bottom notitle"></div></div>'),container:$('<ul class="topic-preview clearfix"></ul>'),item:'<li><a target="_blank"><img /></a></li>',bar:$('<ul id="topic_slider" class="slider-bar"></ul>'),barContainer:".s-bottom",barItem:"<li></li>",dataSrc:"/index/slideshow/"+d+".json"};0>$.inArray(d,[])&&merge(c,{wrapper:$('<div class="topic-preview-wrapper"><div class="s-bottom"><div class="title"></div></div></div>'),renderCallback:function(g,f,i){var h=$('<span><a href="'+f.link+'" title="'+f.title+'">'+f.title+"</a></span>").appendTo($(".title",g));$("[preview] img",g).eq(i).attr("alt",f.title);0==i&&h.show()},slideCallback:function(f,e){$(".title span",f).hide();$(".title",f).find("span:eq("+e+")").fadeIn(300)}});0<=$.inArray(d,[13,11,23])?merge(c,{wrapper:$('<div class="topic-preview-wrapper ex"><div class="s-bottom-wrapper"><div class="s-bottom"><div class="title"></div></div></div></div>'),initCallback:function(f,e){$(".title",f).appendTo(f.find(".s-bottom"));$('<li class="current"></li>').appendTo(f.find(".slider-bar"))},barRenderCallback:function(f,e,g){$('<img src="'+e.simg+'" alt="'+(e.title||"")+'" />').appendTo(f);$("<div>").addClass("mask").appendTo(f)},slideCallback:function(g,f){$(".title span",g).hide();$(".title",g).find("span:eq("+f+")").fadeIn(300);var i=g.find(".slider-bar"),h=0==$(".current",i).length?$('<li class="current"></li>').appendTo(i):$(".current",i),i=i.find("li[bar]:eq("+f+")"),i=i.position().left+parseInt(i.css("margin-left"))-parseInt(h.css("border-left-width"));h.css("left",i)}}):ModuleManage.load({topArea:{area:$(".container-top"),panes:{list:{bodyClass:".container-top-sub",dataContainer:$(".container-top").find(".top-list"),dataSource:"/index/catalogy/"+d+"-recommend.json",pagesize:6,render:"renderTopList"}}}});(new SliderController(c)).init()}function CreateCalendar(b){this.cld_data={};this.WEEKDAY="\u5468\u4e00 \u5468\u4e8c \u5468\u4e09 \u5468\u56db \u5468\u4e94 \u5468\u516d \u5468\u65e5".split(" ");this.AREA=[{id:2,val:"\u65e5\u5267"},{id:3,val:"\u7f8e\u5267"},{id:1,val:"\u56fd\u4ea7"},{id:4,val:"\u5176\u4ed6"}];this.target=b;this.listClassName=".cld-new";this.loading=0<this.target.find(".cld-loading").length?this.target.find(".cld-loading"):$('<div class="cld-loading">\u6570\u636e\u8f7d\u5165\u4e2d...</div>').appendTo(this.target.find(this.listClassName));this.createCldArea()}CreateCalendar.prototype={createCldArea:function(){var b=this;$.getJSON("/index/bangumi.json",function(a){b.loading.remove();b.initCldData(a);b.createCalendar(b.target,b.cld_data)})},initCldData:function(d){for(var c=0;c<this.AREA.length;c++){this.cld_data[this.AREA[c].id]=[]}for(c=0;c<d.length;c++){this.cld_data[4>d[c].areaid?d[c].areaid:4].push(d[c])}},createCalendar:function(i,h){for(var n=this,k=0;7>k;k++){var m=$('<div class="weekday"><div class="date"><b>'+n.WEEKDAY[k]+'</b></div><div class="content"></div></div>'),l=$(".content",m);(k==(new Date).getDay()-1||6==k&&0==(new Date).getDay())&&l.addClass("on");m.appendTo($(n.listClassName,i))}var j=$('<div class="c-list no-weekly"></div>');$("#new_tab li",i).click(function(){var b=$(this);if(!b.hasClass("on")){$("#new_tab li",i).removeClass("on");b.addClass("on");b.is(":last-child")?b.addClass("last"):b.is(":first-child")&&b.addClass("first");var a=b.attr("tid");0==b.attr("weekly")?(j.html("").insertBefore($("#show_more",i)),$(".weekday",i).hide(),n.createCldList(i,h[a],!1)):($(".no-weekly",i).html("").remove(),$(".weekday",i).show(),n.createCldList(i,h[a]))}});$('<a class="btn_show_more" id="show_more">\u663e\u793a\u5168\u90e8</a>').appendTo($(n.listClassName,i)).click(function(){var a=$(this),c=$(n.listClassName,i);a.hasClass("active")?($(".hidden",c).hide(),n.setListHeight(c),a.removeClass("active"),a.html("\u663e\u793a\u5168\u90e8"),$(window).scrollTop(i.offset().top)):(n.resetListHeight(c),$(".hidden",c).show(),a.addClass("active"),a.html("\u6536\u8d77\u5217\u8868"))});n.createCldList(i,h[2])},createCldList:function(i,h,n){this.resetListHeight(i);$(".content",i).html('<ul class="c-list"></ul>');if("undefined"!=typeof n&&!n){var k=$(".no-weekly",i)}0==h.length&&"undefined"!=typeof k&&$('<div class="no-data">\u6ca1\u6709\u66f4\u591a\u4fe1\u606f</div>').appendTo(k);for(var m=0;m<h.length;m++){if("undefined"==typeof n||n){k=$(".weekday:eq("+(0!=h[m].weekday?h[m].weekday-1:6)+")",i).find(".content")}var l=$('<li><a class="t" href="/sp/'+h[m].title+'" target="_blank" title="'+h[m].title+'">'+(0==$(".c-list",k).find("li").length?'<img src="'+h[m].cover+'" alt="'+h[m].title+'" />':"")+"<p>"+h[m].title+'</p></a><p class="i">\u66f4\u65b0\u81f3<b>'+h[m].bgmcount+"</b></p></li>"),j=$('<a class="sbs-btn">\u8ba2\u9605</a>').appendTo(l);5<=$("li",k).length&&l.addClass("hidden");l.appendTo($(".c-list",k));setSubscribe(j,h[m].spid,"done")}this.createComplete(i)},createComplete:function(b){b=b.find(this.listClassName);this.setListHeight(b)},setListHeight:function(b){b.find(".weekday").each(function(a,h){h=$(h);if(h.height()<b.height()){var e=h.find(".content"),g=e.outerHeight()-e.height();e.height(b.height()-b.find(".date").outerHeight()-g)}})},resetListHeight:function(b){b.find(".content").css("height","auto")}};function createAreaByJSON(i,h){function n(d){var c=$('[
          area="'+d+'"
        ]');0!=c.length&&(c=k[d]={tid:d,area:c,MAIN_TIDS:m,panes:{}},"undefined"!=typeof l[d]&&(c.name=l[d]),createRanking(d,c),createNew(d,c))}var k={},m=[],l={1:"douga",3:"music",4:"game",5:"ent",11:"teleplay",13:"bangumi",23:"movie",36:"technology",119:"kichiku",129:"dance"},j;for(j in l){m.push(parseInt(j))}"undefined"==typeof h&&(h=[parseInt(i)]);0>$.inArray(i,[13,23])&&n(parseInt(i));for(j=0;j<h.length;j++){n(h[j])}createPromote(i);ModuleManage.load(k)}function merge(e,d){for(var f in d){e[f]=d[f]}return e}function createRanking(j,i){var p=[15,83,34,86,33,32,128,82,145,146,147,153],m=[],o=[33,32,37,40,83,85,82,127,145,146,147,152,153],n=[20,129],l=[145,146,147,82,83,85];if(0>$.inArray(j,[])){var k=i.area.find(".rlist");i.panes.ranking={wrapper:".b-r",dataContainer:0<k.length?k:'<ul class="rlist wide"></ul>',render:"renderSubRanking",pagesize:10};0<=$.inArray(j,i.MAIN_TIDS)&&(i.panes.ranking.pagesize=5);0<=$.inArray(j,p)?i.panes.ranking.type="hot":(i.panes.ranking.tab=CreateArea.createRankingTab({selected:0<=$.inArray(j,n)?1:0}),i.panes.ranking.tabTarget=".b-head .left",i.panes.ranking.tabChange="tabChange");0>$.inArray(j,m)?(p={wrapper:'<div class="right"></div>',selected:0<=$.inArray(j,o)?1:0},0<=$.inArray(j,l)&&(p.month=!0),i.panes.ranking.selector=CreateArea.createRankingSelect(j,p),i.panes.ranking.selectorTarget=".b-head",i.panes.ranking.selectChange="selectChange"):i.panes.ranking.dataSource="/index/catalogy/"+j+"-3day.json";32==j&&(i.panes.ranking.pagesize=8,i.panes.ranking.selectorTarget=".b-head.ranking");127==j&&(i.panes.ranking.pagesize=4,i.panes.ranking.dataContainer=0<k.length?k.addClass("kichiku-course"):'<ul class="rlist wide kichiku-course"></ul>')}}function createNew(d,c){c.panes.newv={wrapper:".b-l",dataContainer:c.area.find(".v-list"),render:"renderSubList",pagesize:15,tab:'<ul class="b-slt-tab"><li class="on" data-source="/index/ding/'+d+'.json">\u6709\u65b0\u52a8\u6001</li><li type="newv" data-source="/index/new/'+d+'.json">\u6700\u65b0\u6295\u7a3f</li></ul>',tabTarget:".b-head",tabChange:function(f){var e=f.tab.find("li.on");"undefined"!=typeof e.attr("loaded")&&"undefined"==typeof f._super.data[e.attr("data-source")]&&(f._super.data[e.attr("data-source")]=f.dataContainer.clone());f._super.tabChange(f)},push:!0};32==d&&(c.panes.newv.pagesize=20);0<=$.inArray(d,c.MAIN_TIDS)&&(c.panes.newv.pagesize=10,c.panes.newv.readmore=!1)}function createPromote(j){var i={},p={videoList:{},spList:{dataContainer:".r-list-pmt",render:"renderEndedBangumiPromote"},picList:{bodyClass:".b-r",render:"renderAds",renderComplete:function(b){}},smallList:{template:'<div class="b-recommend"><div class="b-head"><span class="b-head-t">\u672c\u533a\u63a8\u8350</span></div></div>',render:"renderSubRecommend"}},m={0:[4,5,6,7,8,9,10,11,13,14,16],13:[5.1],119:[17]},p={12:{area:$("#b_promote"),params:p.picList,customParams:{dataContainer:$("#b_promote").find(".index-promote"),pagesize:1}},4:{area:$("#b_douga"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},5:{area:$("#b_bangumi"),params:p.spList,customParams:{title:'<span class="b-head-t">\u5b8c\u7ed3\u52a8\u753b\u63a8\u8350</span>',wrapper:".b-r.bangumi",dataContainer:'<ul class="r-list-pmt"></ul>',pagesize:6,name:"bangumi"}},"5.1":{area:$(".container-row[area=32]"),params:p.spList,customParams:{wrapper:".b-r",dataContainer:$(".container-row[area=32]").find(".r-list-pmt.simple"),pagesize:2}},6:{area:$("#b_music"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},7:{area:$("#b_game"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},8:{area:$("#b_technology"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},9:{area:$("#b_ent"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},10:{area:$("#b_dance"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},11:{area:$("#b_kichiku"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},13:{area:$("#b_movie"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},14:{area:$("#b_teleplay"),params:p.picList,customParams:{dataContainer:'<div class="r-promote"></div>',pagesize:2}},16:{area:$("#b_recommend"),params:p.picList,customParams:{dataContainer:'<div class="r-promote multi"></div>'}},17:{area:$(".container-row[area=127]"),params:p.picList,customParams:{bodyClass:".b-body",dataContainer:$('<div class="r-promote kichiku"></div>').insertAfter($(".container-row[area=127] .b-r .b-body .rlist"))}}};"undefined"==typeof j&&(j=0);if("undefined"!=typeof m[j]){for(var o=0;o<m[j].length;o++){var n=m[j][o],l=p[n];if(0!=l.area.length){var k=i["promote_"+j+"_"+n]={area:l.area,panes:{}},n=k.panes["pane_"+j+"_"+n]={dataSource:"/index/promote/"+parseInt(n)+".json"};merge(n,l.params);"undefined"!=typeof l.customParams&&merge(n,l.customParams);0<k.area.find($(n.dataContainer)).length&&(n.dataContainer=k.area.find(n.dataContainer))}}}ModuleManage.load(i)}function loadRecentBangumi(){0!=$("#list_bangumi_new").length&&$.getJSON("/index/bangumi.json",function(g){var e=$("#list_bangumi_new > .bgmbox > ul");e.empty();for(var j=0,h=0;h<g.length;h++){var i=$("<li"+(g[h]["new"]?' class="new"':12>h?' class="sh"':' style="display:none"')+'><div class="c-item"><a class="preview" href="/sp/'+encodeURIComponent(g[h].title)+'" target="_blank" title="'+g[h].title+'"><img data-img="'+g[h].mcover+'" alt="'+g[h].title+'" /></a><div class="r-i"><p class="t"><a href="/sp/'+encodeURIComponent(g[h].title)+'" target="_blank" title="'+g[h].title+'">'+g[h].title+'</a></p><p class="num">\u66f4\u65b0\u81f3<span>'+g[h].bgmcount+"\u8bdd</span></p></div></div></li>").appendTo(e);0==j&&(j=i.outerHeight())}lazyImage.lazy(e);12<g.length&&(g=$('<div class="bgmbox-bottom"><div class="btn_show_more" id="btn_bgm_show_more">\u663e\u793a\u5168\u90e8</div></div>').appendTo("#list_bangumi_new > .bgmbox"),$("#btn_bgm_show_more",g).click(function(){$(this).hasClass("active")?($(this).removeClass("active").html("\u663e\u793a\u5168\u90e8"),$(" > li",e).hide(),$(" > li.new, > li.sh",e).show(),$(window).scrollTop($("#list_bangumi_new").offset().top-50)):($(this).addClass("active").html("\u6536\u8d77\u5217\u8868"),$(" > li",e).show())}))})}Date.prototype.toYMD=function(){var e,d,f;e=String(this.getFullYear());d=String(this.getMonth()+1);1==d.length&&(d="0"+d);f=String(this.getDate());1==f.length&&(f="0"+f);return e+"-"+d+"-"+f};function imod_box_get3d_date(){var b=new Date;b.setTime(b.getTime()-604800000);return b.toYMD()+","+(new Date).toYMD()}function typeDescription(){var b=null;$(".fcname .n_num li").on("mouseenter",function(){var a=$(this);if(a.attr("desc")){clearTimeout(b);$(".type-desc").stop(!0,!0).remove();var l=$(".type-desc").length,i=$(".type-desc").is(":visible"),k=$(".fcname .n_num"),j=l?$(".type-desc"):$('<div class="type-desc"><div class="type-arrow"></div><div class="txt"></div></div>'),l=a.offset().left-k.offset().left+a.outerWidth()/2,h=100*(l/k.outerWidth())+"% 0%";j.appendTo(k).stop().show().find(".txt").html(a.attr("desc"));a=0>l-j.outerWidth()/2?0:l-j.outerWidth()/2;j.attr("style","transform-origin:"+h+";-webkit-transform-origin:"+h+";left:"+a+"px;");k=j.find(".type-arrow");0==a?k.css({left:l-k.outerWidth()/2}):k.css({left:j.outerWidth()/2-k.outerWidth()/2});i?j.addClass("in"):setTimeout(function(){j.addClass("in")},0)}});$(".fcname .n_num li").on("mouseleave",function(){$(this);clearTimeout(b);b=setTimeout(function(){$(".type-desc").stop(!0,!0).fadeOut(200,function(){$(".type-desc").removeClass("in")})},300)});$(".fcname .n_num").on("mouseenter",".type-desc",function(){clearTimeout(b)});$(".fcname .n_num").on("mouseleave",".type-desc",function(){clearTimeout(b);b=setTimeout(function(){$(".type-desc").stop(!0,!0).fadeOut(200,function(){$(".type-desc").removeClass("in")})},300)})}$(function(){"undefined"!=typeof tid?(fixImg($(".vidbox.v-list.sub img")),13==tid&&loadRecentBangumi(),0<$(".container-top.sub").length&&createBanner(tid),"undefined"==typeof sub_tids?createAreaByJSON(tid):(typeDescription(),createAreaByJSON(tid,sub_tids))):createPromote(0)});
}

/*
     FILE ARCHIVED ON 08:27:46 Jun 30, 2015 AND RETRIEVED FROM THE
     INTERNET ARCHIVE ON 13:26:35 Oct 13, 2026.
     JAVASCRIPT APPENDED BY WAYBACK MACHINE, COPYRIGHT INTERNET ARCHIVE.

     ALL OTHER CONTENT MAY ALSO BE PROTECTED BY COPYRIGHT (17 U.S.C.
     SECTION 108(a)(3)).
*/
/*
playback timings (ms):
  captures_list: 0.576
  exclusion.robots: 0.059
  exclusion.robots.policy: 0.047
  esindex: 0.009
  cdx.remote: 30.262
  LoadShardBlock: 158.384 (3)
  PetaboxLoader3.datanode: 277.155 (5)
  load_resource: 489.026 (2)
  PetaboxLoader3.resolve: 346.796 (2)
*/