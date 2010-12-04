/**
 * Copyright 2010 RedHog, Egil Möller <egil.moller@piratpartiet.se>
 * Copyright 2010 Pita, Peter Martischka <petermartischka@googlemail.com>
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

import("sqlbase.sqlbase");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("etherpad.log");

function tagsToQuery(tags, antiTags) {
  var prefixed = [];
  for (i = 0; i < antiTags.length; i++)
    prefixed[i] = '!' + antiTags[i];
  return tags.concat(prefixed).join(',');
}

function queryToTags(query) {
  var tags = {
    tags: new Array(),
    antiTags: new Array()
  };

  if (query != undefined && query != '') {
    var query = query.split(',');
    for (i = 0; i < query.length; i++)
      if (query[i][0] == '!')
        tags.antiTags.push(query[i].substring(1));
      else
        tags.tags.push(query[i]);
  }
  return tags;
}

function stringFormat(text, obj) {
  var name;
  for (name in obj) {
    //iterate through the params and replace their placeholders from the original text
    text = text.replace(new RegExp('%\\(' + name + '\\)s', 'gi' ), obj[name]);
  }
  return text;
}

/* All these sql query functions both takes a querySql object as
 * parameter and returns one. This object has two members - sql and
 * params. Sql is a string of an sql table name or a subqyery in
 * parens. The table pr subquery should have an ID column containing a
 * PAD_ID.
 */

/* Filters pads by tags and anti-tags */
function getQueryToSql(tags, antiTags, querySql) {
  var queryTable;
  var queryParams;

  if (querySql == null) {
    queryTable = 'PAD_META';
    queryParams = [];
  } else {
    queryTable = querySql.sql;
    queryParams = querySql.params;
  }

  var exceptArray = [];
  var joinArray = [];
  var whereArray = [];
  var exceptParamArray = [];
  var joinParamArray = [];

  var info = new Object();
  info.queryTable = queryTable;
  info.n = 0;
  var i;

  for (i = 0; i < tags.length; i++) {
    tag = tags[i];
    joinArray.push(
     stringFormat(
      'join PAD_TAG as pt%(n)s on ' +
      ' pt%(n)s.PAD_ID = p.ID ' +
      'join TAG as t%(n)s on ' +
      ' t%(n)s.ID = pt%(n)s.TAG_ID ' +
      ' and t%(n)s.NAME = ? ',
      info));
    joinParamArray.push(tag);
    info.n += 1;
  }
  for (i = 0; i < antiTags.length; i++) {
    tag = antiTags[i];
    exceptArray.push(
     stringFormat(
      'left join (PAD_TAG as pt%(n)s ' +
      '	      join TAG AS t%(n)s on ' +
      '	       t%(n)s.NAME = ? ' +
      '	       and t%(n)s.ID = pt%(n)s.TAG_ID) on ' +
      ' pt%(n)s.PAD_ID = p.ID ',
      info));
    whereArray.push(stringFormat('pt%(n)s.TAG_ID is null', info));
    exceptParamArray.push(tag);
    info.n += 1;
  }

  info["joins"] = joinArray.join(' ');
  info["excepts"] = exceptArray.join(' ');
  info["wheres"] = whereArray.length > 0 ? ' where ' + whereArray.join(' and ') : '';
 
  /* Create a subselect from all the joins */ 
  return {
   sql: stringFormat(
    '(select distinct ' +
    '  p.ID ' +
    ' from ' +
    '  %(queryTable)s as p ' +
    '  %(excepts)s ' +
    '  %(joins)s ' +
    ' %(wheres)s ' +
    ') ',
    info),
   params: queryParams.concat(exceptParamArray).concat(joinParamArray)};
}

/* Returns the sql to count the number of results from some other
 * query. */
function nrSql(querySql) {
  var queryTable;
  var queryParams;

  if (querySql == null) {
    queryTable = 'PAD_META';
    queryParams = [];
  } else {
    queryTable = querySql.sql;
    queryParams = querySql.params;
  }

  var info = [];
  info['query_sql'] = queryTable
  return {
   sql: stringFormat('(select count(*) as total from %(query_sql)s as q)', info),
   params: queryParams};
}

/* Returns the sql to select the 10 best new tags to tack on to a
 * query, that is, the tags that are closest to halving the result-set
 * if tacked on. */
function newTagsSql(querySql) {
  var queryTable;
  var queryParams;

  if (querySql == null) {
    queryTable = 'PAD_META';
    queryParams = [];
  } else {
    queryTable = querySql.sql;
    queryParams = querySql.params;
  }

  var info = [];
  info["query_post_table"] = queryTable;
  var queryNrSql = nrSql(querySql);
  info["query_nr_sql"] = queryNrSql.sql;
  queryNrParams = queryNrSql.params;

  return {
   sql: stringFormat('' +
    'select ' +
    ' t.NAME tagname, ' +
    ' count(tp.PAD_ID) as matches, ' +
    ' tn.total - count(tp.PAD_ID) as antimatches, ' +
    ' abs(count(tp.PAD_ID) - (tn.total / 2)) as weight ' +
    'from ' +
    ' TAG as t, ' +
    ' PAD_TAG as tp, ' +
    ' %(query_nr_sql)s as tn ' +
    'where ' +
    ' tp.TAG_ID = t.ID ' +
    ' and tp.PAD_ID in %(query_post_table)s ' +
    'group by t.NAME, tn.total ' +
    'having ' +
    ' count(tp.PAD_ID) > 0 and count(tp.PAD_ID) < tn.total ' +
    'order by ' +
    ' abs(count(tp.PAD_ID) - (tn.total / 2)) asc ' +
    'limit 10 ' +
    '', info),
   params: queryNrParams.concat(queryParams.concat([]))};
}

/* Select the X last changed matching pads and some extra information
 * on them. */
function padInfoSql(querySql, limit, offset) {
  var sql = '' +
   'select ' +
   '  m.id as ID, ' +
   '  DATE_FORMAT(m.lastWriteTime, \'%a, %d %b %Y %H:%i:%s GMT\') as lastWriteTime, ' +
   '  c.TAGS ' +
   'from ' +
      querySql.sql + ' as q ' +
   '  join PAD_SQLMETA as m on ' +
   '    m.id = q.ID ' +
   '  join PAD_TAG_CACHE as c on ' +
   '    c.PAD_ID = q.ID ' +
   'order by ' +
   '  m.lastWriteTime desc ';
  if (limit != undefined)
   sql += 'limit ' + limit + " ";
  if (offset != undefined)
   sql += 'offset ' + offset + " ";
  return {
   sql: sql,
   params: querySql.params
  };
}
