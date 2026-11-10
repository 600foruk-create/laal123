<?php
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

$html = file_get_contents('index.html');
// Force app_v128.js and append timestamp
$html = preg_replace('/assets\/js\/app[a-zA-Z0-9_]*\.js[^\'"]*/', 'assets/js/app_v128.js?t=' . time(), $html);
// Force HTML templates to append timestamp
$html = preg_replace('/\.html([^\'"]*)/', '.html?t=' . time(), $html);

echo $html;
