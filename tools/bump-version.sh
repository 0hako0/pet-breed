#!/bin/sh
# 読み込むファイルにバージョン番号（?v=…）をつけ直す。
# ブラウザが古いファイルと新しいファイルを混ぜて使わないよう、更新のたびに実行する:  sh tools/bump-version.sh
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M%S)
sed -i.bak -E "s/\?v=[0-9]+/?v=$V/g" index.html && rm -f index.html.bak
echo "version: $V"
