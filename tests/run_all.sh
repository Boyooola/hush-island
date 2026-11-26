#!/bin/sh
# run_all.sh test...: run each test against a fresh local island, and keep only what failed.
cd /home/claude/hush-island
: > /tmp/all_tests.log
for t in "$@"; do
  echo "== $t" >> /tmp/all_tests.log
  FRESH=1 timeout 420 /home/claude/ember-isle/wr_and.sh 40 node /home/claude/ember-isle/$t.mjs > /tmp/one_test.log 2>&1
  echo "exit $?" >> /tmp/all_tests.log
  grep -E "FAIL|page errors|FAILED|Error|ERR " /tmp/one_test.log | grep -v "ERR_FAILED\|net::" | cut -c1-420 | head -12 >> /tmp/all_tests.log
  pkill -f chrome; pkill -f workerd; sleep 1
done
echo ALLDONE >> /tmp/all_tests.log
