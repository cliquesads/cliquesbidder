#!/bin/bash

DISK_NAME='dev-bidder-disk'
MNT_DIR='disk1'

DISK_ROOT_PATH='/dev/disk/by-id/google-'
DISK_PATH="$DISK_ROOT_PATH""$DISK_NAME"
MNT_PATH=/mnt/"$MNT_DIR"

sudo mkdir $MNT_PATH
sudo /usr/share/google/safe_format_and_mount -m "mkfs.ext4 -F" $DISK_PATH $MNT_PATH
sudo chmod a+w $MNT_PATH

# Create necessary directories for all RTBKit installs and
# symlink to home
#
# RTBKit is huge and you do not want to run it from the tiny root disk
# GCE supplies
if [ ! -d $MNT_PATH/local ]; then
  mkdir $MNT_PATH/local
fi
if [ ! -d $MNT_PATH/local/bin ]; then
  mkdir $MNT_PATH/local/bin
fi
if [ ! -d $MNT_PATH/local/lib ]; then
  mkdir $MNT_PATH/local/lib
fi
if [ ! -d $MNT_PATH/repositories ]; then
  mkdir $MNT_PATH/repositories
fi

#create symlinks in home directory
rm -rf /home/bliang/repositories
rm -rf /home/bliang/rtbkit_logs
rm -rf /home/bliang/local
ln -s $MNT_PATH/repositories /home/bliang/repositories
ln -s $MNT_PATH/local /home/bliang/local
ln -s $MNT_PATH/data/rtbkit_logs /home/bliang/rtbkit_logs