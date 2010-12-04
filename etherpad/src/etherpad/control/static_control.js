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

import("faststatic");
import("dispatch.{Dispatcher,PrefixMatcher,forward}");

import("etherpad.utils.*");
import("etherpad.globals.*");
import("etherpad.admin.plugins");

function onRequest() {
  var staticBase = '/static';

  var opts = {cache: isProduction()};
  var serveCompressed = faststatic.compressedFileServer(opts);

  var disp = new Dispatcher();

  disp.addLocations([
    ['/favicon.ico', faststatic.singleFileServer(staticBase + '/favicon.ico', opts)],
    ['/robots.txt', serveRobotsTxt],
    ['/crossdomain.xml', faststatic.singleFileServer(staticBase + '/crossdomain.xml', opts)],
    [PrefixMatcher('/static/compressed/'), serveCompressed]])

  for (fmt in {'js':0, 'css':0, 'swf':0, 'html':0, 'img':0, 'zip':0}) {
    for (plugin in plugins.loadPlugins().plugins) {
      disp.addLocations([[PrefixMatcher('/static/'+fmt+'/plugins/'+plugin+'/'), faststatic.directoryServer('/plugins/' + plugin + '/static/'+fmt+'/', opts)]]);
    }
    disp.addLocations([[PrefixMatcher('/static/'+fmt+'/'), faststatic.directoryServer(staticBase+'/'+fmt+'/', opts)]]);
  }
  disp.addLocations([[PrefixMatcher('/static/'), faststatic.directoryServer(staticBase, opts)]]);

  return disp.dispatch();
}

function serveRobotsTxt(name) {
  response.neverCache();
  response.setContentType('text/plain');
  response.write('User-agent: *\n');
  if (!isProduction()) {
    response.write('Disallow: /\n');
  }
  response.stop();
  return true;
}
