#!/bin/bash
# This script attempts to find an existing installation of Java that meets a minimum version
# requirement on a Linux machine.  If it is successful, it will export a JAVA_HOME environment
# variable that can be used by another calling script.
#
# To specify the required version, set the REQUIRED_VERSION to the major version required,
# e.g. 1.3, but not 1.3.1.
REQUIRED_VERSION=1.6

# Transform the required version string into a number that can be used in comparisons
REQUIRED_VERSION=`echo $REQUIRED_VERSION | sed -e 's;\.;0;g'`
# Check JAVA_HOME directory to see if Java version is adequate
if [ $JAVA_HOME ]
then
        JAVA_EXE=$JAVA_HOME/bin/java
        $JAVA_EXE -version 2> tmp.ver
        VERSION=`cat tmp.ver | grep "java version" | awk '{ print substr($3, 2, length($3)-2); }'`
        echo $VERSION
        rm tmp.ver
        VERSION=`echo $VERSION | awk '{ print substr($1, 1, 3); }' | sed -e 's;\.;0;g'`
        if [ $VERSION ]
        then
                if [ $VERSION -ge $REQUIRED_VERSION ]
                then
                        JAVA_HOME=`echo $JAVA_EXE | awk '{ print substr($1, 1, length($1)-9); }'`
                else
                        JAVA_HOME=
                fi
        else
                JAVA_HOME=
        fi
fi

# If the existing JAVA_HOME directory is adequate, then leave it alone
# otherwise, use 'locate' to search for other possible java candidates and
# check their versions.
if [ $JAVA_HOME ]
then
        :
else
        for JAVA_EXE in `locate bin/java | grep java$ | xargs echo`
        do
                if [ $JAVA_HOME ]
                then
                        :
                else
                        $JAVA_EXE -version 2> tmp.ver 1> /dev/null
                        VERSION=`cat tmp.ver | grep "java version" | awk '{ print substr($3, 2, length($3)-2); }'`
                        rm tmp.ver
                        VERSION=`echo $VERSION | awk '{ print substr($1, 1, 3); }' | sed -e 's;\.;0;g'`
                        if [ $VERSION ]
                        then
                                if [ $VERSION -ge $REQUIRED_VERSION ]
                                then
                                        JAVA_HOME=`echo $JAVA_EXE`
 else
                                        echo "JAVA Version too old - Please install a new Java version"
                                fi
                        fi
                fi
        done
fi

# If the correct Java version is detected, then export the JAVA_HOME environment variable
if [ $JAVA_HOME ]
then
        `export JAVA_HOME="$JAVA_HOME"`
	export JAVA_HOME
        #echo $JAVA_HOME
fi


