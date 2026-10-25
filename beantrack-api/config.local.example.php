<?php
// Copy this file to config.local.php and fill in your local credentials.
// config.local.php is ignored by git. It must return an array.
return [
    'host' => '127.0.0.1',
    'user' => 'beantrack',
    'pass' => 'change-me',
    'name' => 'beantrack',

    // Optional: require this token on every API request. The frontend needs the
    // same value as VITE_API_TOKEN in .env.local.
    // 'token' => 'a-long-random-string',
];
