/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import("exceptionutils");
import("fileutils.{readFile,fileLastModified}");
import("ejs.EJS");
import("funhtml.*");
import("stringutils");
import("stringutils.startsWith");
import("jsutils.*");

import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.collab.collab_server");
import("etherpad.pad.model");
import("etherpad.pro.domains");
import("etherpad.pne.pne_utils");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.log");
import("etherpad.admin.plugins");

jimport("java.lang.System.out.print");
jimport("java.lang.System.out.println");

jimport("java.io.File");

//----------------------------------------------------------------
// utilities
//----------------------------------------------------------------

// returns globally-unique padId
function randomUniquePadId() {
	
  var id = stringutils.randomString(10);
  while (model.accessPadGlobal(id, function(p) { return p.exists(); }, "r")) {
    id = stringutils.randomString(10);
  }
  log.info("going to return id: " + id)
  return id;
}

//----------------------------------------------------------------
// template rendering
//----------------------------------------------------------------

function findExistsingFile(files) {
  for (var i = 0; i < files.length; i++) {
    var f = new File('./src' + files[i]);
    if (f.exists())
      return files[i];
  }
}

function findThemeFile(filename, pluginList) {
  var files = [];
  var theme = appjet.config.theme;
  if (   request.params._theme != undefined
      && request.params._theme.match(new RegExp("^[^/]*$", "g")) != null) {
    theme = request.params._theme;
  }
  if (pluginList != undefined)
    pluginList.forEach(function (plugin) {
      if (plugin != undefined) {
	files.push('/themes/' + theme + '/plugins/' + plugin + '/' + filename);
	files.push('/themes/default/plugins/' + plugin + '/' + filename);
	files.push('/plugins/' + plugin + '/' + filename);
      }
    });
  files.push('/themes/' + theme + '/' + filename);
  files.push('/themes/default/' + filename);

  return findExistsingFile(files);
}

function findTemplate(filename, pluginList) {
 return findThemeFile('templates/' + filename, pluginList);
}

function Template(params, pluginList) {
 this._defines = {}
 this._params = params;
 this._params.template = this;
 this._pluginList = pluginList;
}

Template.prototype.define = function(name, fn) {
 this._defines[name] = fn;
 return '';
}

Template.prototype.use = function (name, fn, arg) {
  if (this._defines[name] != undefined)
    return this._defines[name](arg);
  else if (fn != undefined)
    return fn(arg);
  else
    return '';
}

Template.prototype.inherit = function (template) {
  return renderTemplateAsString(template, this._params, this._pluginList);
}

Template.prototype.include = function (template, params, pluginList) {
  var sendArgs = {};
  for (var name in this._params)
    if (name != 'template')
      sendArgs[name] = this._params[name];
  if (params != undefined)
    for (var name in params)
      sendArgs[name] = params[name];

  if (pluginList == undefined)
    pluginList = this._pluginList;
  else
    pluginList = pluginList.concat(this._pluginList);

  return renderTemplateAsString(template, sendArgs, pluginList);
}

Template.prototype.callHook = function (hookName, args) {
  var sendArgs = {template:this};
  if (args != undefined)
    for (var name in args)
      sendArgs[name] = args[name];
  return plugins.callHook(hookName, sendArgs);
}

Template.prototype.callHookStr = function (hookName, args, sep, pre, post) {
  var sendArgs = {template:this};
  if (args != undefined)
    for (var name in args)
      sendArgs[name] = args[name];
  return plugins.callHookStr(hookName, sendArgs, sep, pre, post);
}

function renderTemplateAsString(filename, data, pluginList) {
  data = data || {};
  data.helpers = helpers; // global helpers
  data.plugins = plugins; // Access callHook and the like...
  if (data.template == undefined)
    new Template(data, pluginList);

  var f = findTemplate(filename, pluginList); //"/templates/"+filename;
  if(f == undefined) throw 'Couldn\'t find template "'+filename+'"!';
  if (! appjet.scopeCache.ejs) {
    appjet.scopeCache.ejs = {};
  }
  var cacheObj = appjet.scopeCache.ejs[filename];
  if (cacheObj === undefined || fileLastModified(f) > cacheObj.mtime) {
    var templateText = readFile(f);
    templateText += "<%: template.use('body', function () { return ''; }); %> ";
    cacheObj = {};
    cacheObj.tmpl = new EJS({text: templateText, name: filename});
    cacheObj.mtime = fileLastModified(f);
    appjet.scopeCache.ejs[filename] = cacheObj;
  }
  var html = cacheObj.tmpl.render(data);
  return html;
}

function renderTemplate(filename, data, pluginList) {
  response.write(renderTemplateAsString(filename, data, pluginList));
  if (request.acceptsGzip) {
    response.setGzip(true);
  }
}

function renderHtml(bodyFileName, data, pluginList) {
  var bodyHtml = renderTemplateAsString(bodyFileName, data, pluginList);
  response.write(renderTemplateAsString("html.ejs", {bodyHtml: bodyHtml}));
  if (request.acceptsGzip) {
    response.setGzip(true);
  }
}

function renderFramedHtml(contentHtml, plugin) {
  var getContentHtml;
  if (typeof(contentHtml) == 'function') {
    getContentHtml = contentHtml;
  } else {
    getContentHtml = function() { return contentHtml; }
  }

  var template = "framed/framedpage.ejs";
  if (isProDomainRequest()) {
    template = "framed/framedpage-pro.ejs";
  }

  renderHtml(template, {
    renderHeader: renderMainHeader,
    renderFooter: renderMainFooter,
    getContentHtml: getContentHtml,
    isProDomainRequest: isProDomainRequest(),
    renderGlobalProNotice: pro_utils.renderGlobalProNotice
  }, plugin);
}

function renderFramed(bodyFileName, data, plugin) {
  function _getContentHtml() {
    return renderTemplateAsString(bodyFileName, data, plugin);
  }
  renderFramedHtml(_getContentHtml);
}

function renderFramedError(error, plugin) {
  var content = DIV({className: 'fpcontent'},
                  DIV({style: "padding: 2em 1em;"},
                    DIV({style: "padding: 1em; border: 1px solid #faa; background: #fdd;"},
                        B("Error: "), error)));
  renderFramedHtml(content, plugin);
}

function renderNotice(bodyFileName, data, plugin) {
  renderNoticeString(renderTemplateAsString(bodyFileName, data, plugin), plugin);
}

function renderNoticeString(contentHtml, plugin) {
  renderFramed("notice.ejs", {content: contentHtml}, plugin);
}

function render404(noStop, plugin) {
  response.reset();
  response.setStatusCode(404);
  renderFramedHtml(DIV({className: "fpcontent"},
                    DIV({style: "padding: 2em 1em;"},
                       DIV({style: "border: 1px solid #aaf; background: #def; padding: 1em; font-size: 150%;"},
                        "404 not found: "+request.path))), plugin);
  if (! noStop) {
    response.stop();
  }
}

function render500(ex, plugin) {
  response.reset();
  response.setStatusCode(500);
  var trace = null;
  if (ex && (!isProduction())) {
    trace = exceptionutils.getStackTracePlain(ex);
  }
  renderFramed("500_body.ejs", {trace: trace}, plugin);
}

function _renderEtherpadDotComHeader(data) {
  if (!data) {
    data = {selected: ''};
  }
  data.html = stringutils.html;
  data.UL = UL;
  data.LI = LI;
  data.A = A;
  data.isPNE = isPrivateNetworkEdition();
  return renderTemplateAsString("framed/framedheader.ejs", data);
}

function _renderProHeader(data) {
  if (!pro_accounts.isAccountSignedIn()) {
    return '<div style="height: 140px;">&nbsp;</div>';
  }

  var r = domains.getRequestDomainRecord();
  if (!data) { data = {}; }
  data.navSelection = (data.navSelection || appjet.requestCache.proTopNavSelection || '');
  data.proDomainOrgName = pro_config.getConfig().siteName;
  data.isPNE = isPrivateNetworkEdition();
  data.account = getSessionProAccount();
  data.validLicense = pne_utils.isServerLicensed();
  data.pneTrackerHtml = pne_utils.pneTrackerHtml();
  data.isAnEtherpadAdmin = sessions.isAnEtherpadAdmin();
  data.fullSuperdomain = pro_utils.getFullSuperdomainHost();
  return renderTemplateAsString("framed/framedheader-pro.ejs", data);
}

function renderMainHeader(data) {
  if (isProDomainRequest()) {
    return _renderProHeader(data);
  } else {
    return _renderEtherpadDotComHeader(data);
  }
}

function renderMainFooter() {
  return renderTemplateAsString("framed/framedfooter.ejs", {
    isProDomainRequest: isProDomainRequest()
  });
}

//----------------------------------------------------------------
// isValidEmail
//----------------------------------------------------------------

// TODO: make better and use the better version on the client in
// various places as well (pad.js and etherpad.js)
function isValidEmail(x) {
  return (x &&
          ((x.length > 0) &&
           (x.match(/^[\w\.\_\+\-]+\@[\w\_\-]+\.[\w\_\-\.]+$/))));
}

//----------------------------------------------------------------

function timeAgo(d, now) {
  if (!now) { now = new Date(); }

  function format(n, word) {
    n = Math.round(n);
    return ('' + n + ' ' + word + (n != 1 ? 's' : '') + ' ago');
  }

  d = (+now - (+d)) / 1000;
  if (d < 60) { return format(d, 'second'); }
  d /= 60;
  if (d < 60) { return format(d, 'minute'); }
  d /= 60;
  if (d < 24) { return format(d, 'hour'); }
  d /= 24;
  return format(d, 'day');
};


//----------------------------------------------------------------
// linking to a set of new CGI parameters
//----------------------------------------------------------------
function qpath(m) {
  var q = {};
  if (request.query) {
    request.query.split('&').forEach(function(kv) {
      if (kv) {
        var parts = kv.split('=');
        q[parts[0]] = parts[1];
      }
    });
  }
  eachProperty(m, function(k,v) {
    q[k] = v;
  });
  var r = request.path + '?';
  eachProperty(q, function(k,v) {
    if (v !== undefined && v !== null) {
      r += ('&' + k + '=' + v);
    }
  });
  return r;
}

//----------------------------------------------------------------

function ipToHostname(ip) {
  var DNS = Packages.org.xbill.DNS;

  if (!DNS.Address.isDottedQuad(ip)) {
    return null
  }

  try {
    var addr = DNS.Address.getByAddress(ip);
    return DNS.Address.getHostName(addr);
  } catch (ex) {
    return null;
  }
}

function extractGoogleQuery(ref) {
  ref = String(ref);
  ref = ref.toLowerCase();
  if (!(ref.indexOf("google") >= 0)) {
    return "";
  }

  ref = ref.split('?')[1];

  var q = "";
  ref.split("&").forEach(function(x) {
    var parts = x.split("=");
    if (parts[0] == "q") {
      q = parts[1];
    }
  });

  q = decodeURIComponent(q);
  q = q.replace(/\+/g, " ");

  return q;
}

function isTestEmail(x) {
  return (x.indexOf("+appjetseleniumtest+") >= 0);
}

function isPrivateNetworkEdition() {
  return pne_utils.isPNE();
}

function isProDomainRequest() {
  return pro_utils.isProDomainRequest();
}

function hasOffice() {
  return appjet.config["etherpad.soffice"] || appjet.config["etherpad.sofficeConversionServer"];
}

////////// console progress bar

function startConsoleProgressBar(barWidth, updateIntervalSeconds) {
  barWidth = barWidth || 40;
  updateIntervalSeconds = ((typeof updateIntervalSeconds) == "number" ? updateIntervalSeconds : 1.0);

  var unseenStatus = null;
  var lastPrintTime = 0;
  var column = 0;

  function replaceLineWith(str) {
    //print((new Array(column+1)).join('\b')+str);
    print('\r'+str);
    column = str.length;
  }

  var bar = {
    update: function(frac, msg, force) {
      var t = +new Date();
      if ((!force) && ((t - lastPrintTime)/1000 < updateIntervalSeconds)) {
        unseenStatus = {frac:frac, msg:msg};
      }
      else {
        var pieces = [];
        pieces.push(' ', ('  '+Math.round(frac*100)).slice(-3), '%', ' [');
        var barEndLoc = Math.max(0, Math.min(barWidth-1, Math.floor(frac*barWidth)));
        for(var i=0;i<barWidth;i++) {
          if (i < barEndLoc) pieces.push('=');
          else if (i == barEndLoc) pieces.push('>');
          else pieces.push(' ');
        }
        pieces.push('] ', msg || '');
        replaceLineWith(pieces.join(''));

        unseenStatus = null;
        lastPrintTime = t;
      }
    },
    finish: function() {
      if (unseenStatus) {
        bar.update(unseenStatus.frac, unseenStatus.msg, true);
      }
      println();
    }
  };

  println();
  bar.update(0, null, true);

  return bar;
}

function isStaticRequest() {
  return (startsWith(request.path, '/static/') ||
          startsWith(request.path, '/favicon.ico') ||
          startsWith(request.path, '/robots.txt'));
}

function httpsHost(h) {
  h = h.split(":")[0];  // strip any existing port
  if (appjet.config.listenSecurePort != "443" && !appjet.config.hidePorts) {
    h = (h + ":" + appjet.config.listenSecurePort);
  }
  return h;
}

function httpHost(h) {
  h = h.split(":")[0];  // strip any existing port
  if (appjet.config.listenPort != "80" && !appjet.config.hidePorts) {
    h = (h + ":" + appjet.config.listenPort);
  }
  return h;
}

function toJavaException(e) {
  var exc = ((e instanceof java.lang.Throwable) && e) || e.rhinoException || e.javaException ||
    new java.lang.Throwable(e.message+"/"+e.fileName+"/"+e.lineNumber);
  return exc;
}
