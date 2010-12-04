#!/bin/sh
export JAVA_HOME="/System/Library/Frameworks/JavaVM.framework/Home"
export SCALA_HOME="/usr/local/scala"
export JAVA="$JAVA_HOME/bin/java"
export SCALA="$SCALA_HOME/bin/scala"
export PATH="$JAVA_HOME/bin:$SCALA_HOME/bin:/usr/local/mysql/bin:$PATH"
export MYSQL_CONNECTOR_JAR="/Users/admin/etherpad/lib/mysql-connector-java-5.1.13-bin.jar"
export SCALA_LIBRARAY_JAR=/usr/local/scala/lib/scala-library.jar

