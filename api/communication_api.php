<?php
header('Content-Type: application/json; charset=UTF-8');
require_once 'db_config.php';

// Ensure tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS communication_api_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL DEFAULT 1,
        channel VARCHAR(30) NOT NULL,
        provider VARCHAR(50) DEFAULT 'generic',
        is_enabled TINYINT(1) DEFAULT 1,
        config_json LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_channel_company (company_id, channel)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS communication_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL DEFAULT 1,
        channel VARCHAR(30) NOT NULL,
        recipient_type VARCHAR(50) DEFAULT 'Customer',
        recipient_name VARCHAR(150),
        recipient_contact VARCHAR(100),
        message_subject VARCHAR(255) DEFAULT '',
        message_body TEXT,
        status VARCHAR(20) DEFAULT 'Sent',
        response_payload TEXT,
        sent_by VARCHAR(50) DEFAULT 'Administrator',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (channel),
        INDEX (sent_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {
    // Silently continue if already created
}

$action = $_GET['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_SESSION['company_id'] ?? 1);
if ($company_id <= 0) $company_id = 1;

/**
 * Clean phone number for WhatsApp / SMS (e.g. 03001234567 -> 923001234567)
 */
function cleanPhoneNumber($number, $defaultCountryCode = '92') {
    $digits = preg_replace('/[^0-9]/', '', $number);
    if (empty($digits)) return '';
    if (substr($digits, 0, 1) === '0' && strlen($digits) === 11) {
        $digits = $defaultCountryCode . substr($digits, 1);
    }
    return $digits;
}

/**
 * Execute HTTP cURL Request
 */
function executeHttpRequest($url, $method = 'GET', $headers = [], $postData = null, $timeout = 25) {
    $ch = curl_init();
    $curlOpts = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_FOLLOWLOCATION => true
    ];

    if (strtoupper($method) === 'POST') {
        $curlOpts[CURLOPT_POST] = true;
        if (!empty($postData)) {
            $curlOpts[CURLOPT_POSTFIELDS] = is_array($postData) ? http_build_query($postData) : $postData;
        }
    }

    if (!empty($headers)) {
        $curlOpts[CURLOPT_HTTPHEADER] = $headers;
    }

    curl_setopt_array($ch, $curlOpts);
    $response = curl_exec($ch);
    $err = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'success' => ($err === '' && $httpCode >= 200 && $httpCode < 400),
        'http_code' => $httpCode,
        'response' => $response,
        'error' => $err
    ];
}

/**
 * Pure PHP SMTP Client implementation (No composer required)
 */
function sendSmtpEmail($host, $port, $crypto, $user, $pass, $fromEmail, $fromName, $toEmail, $toName, $subject, $bodyText, $bodyHtml = '') {
    $timeout = 20;
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        ]
    ]);

    $protocol = '';
    if (strtolower($crypto) === 'ssl' || $port == 465) {
        $protocol = 'ssl://';
    }

    $socket = @stream_socket_client($protocol . $host . ':' . $port, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        return ['success' => false, 'error' => "Cannot connect to SMTP server: $errstr ($errno)"];
    }

    $getResponse = function($sock) {
        $data = "";
        while ($str = fgets($sock, 515)) {
            $data .= $str;
            if (substr($str, 3, 1) === " ") break;
        }
        return $data;
    };

    $sendCommand = function($sock, $cmd) use ($getResponse) {
        fputs($sock, $cmd . "\r\n");
        return $getResponse($sock);
    };

    $initResp = $getResponse($socket);
    if (substr($initResp, 0, 3) !== '220') {
        fclose($socket);
        return ['success' => false, 'error' => "SMTP greeting failed: " . trim($initResp)];
    }

    $ehloResp = $sendCommand($socket, "EHLO " . gethostname());

    // STARTTLS if requested or port 587
    if (strtolower($crypto) === 'tls' || $port == 587) {
        $starttlsResp = $sendCommand($socket, "STARTTLS");
        if (substr($starttlsResp, 0, 3) === '220') {
            $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
            if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
            }
            if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
            }
            if (!stream_socket_enable_crypto($socket, true, $cryptoMethod)) {
                fclose($socket);
                return ['success' => false, 'error' => "Failed to negotiate TLS encryption"];
            }
            $ehloResp = $sendCommand($socket, "EHLO " . gethostname());
        }
    }

    // AUTH LOGIN if credentials provided
    if (!empty($user) && !empty($pass)) {
        $authResp = $sendCommand($socket, "AUTH LOGIN");
        if (substr($authResp, 0, 3) !== '334') {
            fclose($socket);
            return ['success' => false, 'error' => "AUTH LOGIN rejected: " . trim($authResp)];
        }

        $userResp = $sendCommand($socket, base64_encode($user));
        if (substr($userResp, 0, 3) !== '334') {
            fclose($socket);
            return ['success' => false, 'error' => "Username rejected: " . trim($userResp)];
        }

        $passResp = $sendCommand($socket, base64_encode($pass));
        if (substr($passResp, 0, 3) !== '235') {
            fclose($socket);
            return ['success' => false, 'error' => "Authentication failed: " . trim($passResp)];
        }
    }

    // MAIL FROM
    $mailFromResp = $sendCommand($socket, "MAIL FROM: <$fromEmail>");
    if (substr($mailFromResp, 0, 3) !== '250') {
        fclose($socket);
        return ['success' => false, 'error' => "MAIL FROM rejected: " . trim($mailFromResp)];
    }

    // RCPT TO
    $rcptToResp = $sendCommand($socket, "RCPT TO: <$toEmail>");
    if (substr($rcptToResp, 0, 3) !== '250') {
        fclose($socket);
        return ['success' => false, 'error' => "RCPT TO rejected: " . trim($rcptToResp)];
    }

    // DATA
    $dataResp = $sendCommand($socket, "DATA");
    if (substr($dataResp, 0, 3) !== '354') {
        fclose($socket);
        return ['success' => false, 'error' => "DATA rejected: " . trim($dataResp)];
    }

    $boundary = "----=_SoftifyX_" . md5(uniqid(time()));
    $headers = [];
    $headers[] = "From: " . (!empty($fromName) ? "=?UTF-8?B?" . base64_encode($fromName) . "?= <$fromEmail>" : "<$fromEmail>");
    $headers[] = "To: " . (!empty($toName) ? "=?UTF-8?B?" . base64_encode($toName) . "?= <$toEmail>" : "<$toEmail>");
    $headers[] = "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=";
    $headers[] = "Date: " . date('r');
    $headers[] = "MIME-Version: 1.0";
    $headers[] = "Content-Type: multipart/alternative; boundary=\"$boundary\"";

    $messageContent = implode("\r\n", $headers) . "\r\n\r\n";
    $messageContent .= "--$boundary\r\n";
    $messageContent .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $messageContent .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $messageContent .= chunk_split(base64_encode($bodyText)) . "\r\n";

    if (!empty($bodyHtml)) {
        $messageContent .= "--$boundary\r\n";
        $messageContent .= "Content-Type: text/html; charset=UTF-8\r\n";
        $messageContent .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $messageContent .= chunk_split(base64_encode($bodyHtml)) . "\r\n";
    }

    $messageContent .= "--$boundary--\r\n.";

    $finalResp = $sendCommand($socket, $messageContent);
    $sendCommand($socket, "QUIT");
    fclose($socket);

    if (substr($finalResp, 0, 3) === '250') {
        return ['success' => true, 'response' => trim($finalResp)];
    } else {
        return ['success' => false, 'error' => "Email dispatch failed: " . trim($finalResp)];
    }
}

/**
 * Dispatcher function for WhatsApp
 */
/**
 * Universal Dynamic HTTP Communication Engine (Zero-Code Dynamic API Builder)
 * Supports ANY WhatsApp, SMS, or Notification Gateway in the world.
 */
function executeUniversalHttpApi($config, $recipientNumber, $message, $documentUrl = '', $fileName = '') {
    $url = trim($config['endpoint_url'] ?? '');
    if (empty($url)) {
        return ['success' => false, 'error' => 'API Endpoint URL is required in settings'];
    }

    $cleanNo = cleanPhoneNumber($recipientNumber);
    if (empty($cleanNo)) {
        return ['success' => false, 'error' => 'Invalid recipient phone number'];
    }

    $plusNo = '+' . ltrim($cleanNo, '+');
    $localNo = '0' . (substr($cleanNo, 0, 2) === '92' ? substr($cleanNo, 2) : $cleanNo);

    $apiKey = trim($config['api_token'] ?? ($config['api_key'] ?? ''));
    $apiSecret = trim($config['api_secret'] ?? '');
    $sessionId = trim($config['session_name'] ?? ($config['instance_id'] ?? ''));
    $mask = trim($config['sender_id'] ?? '');
    $method = strtoupper(trim($config['http_method'] ?? 'POST_JSON'));

    // Dynamic replacement dictionary
    $replacements = [
        '{mobile}' => $cleanNo,
        '{to}' => $cleanNo,
        '{phone}' => $cleanNo,
        '{mobile_plus}' => $plusNo,
        '{to_plus}' => $plusNo,
        '{phone_plus}' => $plusNo,
        '{mobile_local}' => $localNo,
        '{to_local}' => $localNo,
        '{phone_local}' => $localNo,
        '{message}' => $message,
        '{msg}' => $message,
        '{text}' => $message,
        '{body}' => $message,
        '{api_key}' => $apiKey,
        '{token}' => $apiKey,
        '{secret}' => $apiSecret,
        '{api_secret}' => $apiSecret,
        '{session}' => $sessionId,
        '{session_name}' => $sessionId,
        '{instance_id}' => $sessionId,
        '{mask}' => $mask,
        '{sender}' => $mask,
        '{document_url}' => $documentUrl,
        '{documentUrl}' => $documentUrl,
        '{file_url}' => $documentUrl,
        '{pdf_url}' => $documentUrl,
        '{filename}' => $fileName,
        '{fileName}' => $fileName,
        '{file_name}' => $fileName
    ];

    // Replacements for URL query (URL-encoded values)
    $urlReplacements = [];
    foreach ($replacements as $k => $v) {
        $urlReplacements[$k] = urlencode($v);
    }

    $finalUrl = str_replace(array_keys($urlReplacements), array_values($urlReplacements), $url);

    // Process Headers
    $headers = [];
    $rawHeaders = trim($config['custom_headers'] ?? '');
    if (!empty($rawHeaders)) {
        $lines = explode("\n", str_replace("\r", "", $rawHeaders));
        foreach ($lines as $line) {
            $line = trim($line);
            if (!empty($line)) {
                $headers[] = str_replace(array_keys($replacements), array_values($replacements), $line);
            }
        }
    }

    $hasContentType = false;
    foreach ($headers as $h) {
        if (stripos($h, 'Content-Type:') !== false) {
            $hasContentType = true;
            break;
        }
    }

    // Process Method & Body
    $postData = null;
    $rawBodyTemplate = trim($config['body_template'] ?? '');

    if ($method === 'GET') {
        $res = executeHttpRequest($finalUrl, 'GET', $headers);
    } elseif ($method === 'POST_FORM') {
        if (!$hasContentType) {
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }
        if (!empty($rawBodyTemplate)) {
            $postData = str_replace(array_keys($urlReplacements), array_values($urlReplacements), $rawBodyTemplate);
        } else {
            $postData = http_build_query([
                'to' => $cleanNo,
                'message' => $message,
                'token' => $apiKey
            ]);
        }
        $res = executeHttpRequest($finalUrl, 'POST', $headers, $postData);
    } else {
        // Default: POST_JSON
        if (!$hasContentType) {
            $headers[] = 'Content-Type: application/json';
        }
        if (!empty($rawBodyTemplate)) {
            // For JSON, replace message with escaped JSON string to prevent syntax break on quotes/newlines
            $jsonReplacements = $replacements;
            $jsonReplacements['{message}'] = addcslashes($message, "\"\n\r\t\\");
            $jsonReplacements['{msg}'] = addcslashes($message, "\"\n\r\t\\");
            $jsonReplacements['{text}'] = addcslashes($message, "\"\n\r\t\\");
            $jsonReplacements['{body}'] = addcslashes($message, "\"\n\r\t\\");

            $postData = str_replace(array_keys($jsonReplacements), array_values($jsonReplacements), $rawBodyTemplate);
            if (!empty($documentUrl)) {
                $decodedData = json_decode($postData, true);
                if (is_array($decodedData)) {
                    if (!isset($decodedData['documentUrl'])) {
                        $decodedData['documentUrl'] = $documentUrl;
                    }
                    if (!empty($fileName) && !isset($decodedData['fileName'])) {
                        $decodedData['fileName'] = $fileName;
                    }
                    $postData = json_encode($decodedData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            }
        } else {
            $jsonArr = [
                'to' => $plusNo,
                'text' => $message
            ];
            if (!empty($documentUrl)) {
                $jsonArr['documentUrl'] = $documentUrl;
                $jsonArr['fileName'] = $fileName ?: 'Ledger_Statement.pdf';
            }
            $postData = json_encode($jsonArr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        $res = executeHttpRequest($finalUrl, 'POST', $headers, $postData);
    }

    $respBody = $res['response'] ?? '';
    $parsed = json_decode($respBody, true);

    if (is_array($parsed)) {
        if (!empty($parsed['success']) || (isset($parsed['status']) && in_array(strtolower($parsed['status']), ['success', 'sent', 'in_progress', 'ok']))) {
            return ['success' => true, 'response' => $respBody];
        }
        if (isset($parsed['error'])) {
            $errMsg = is_array($parsed['error']) ? json_encode($parsed['error']) : $parsed['error'];
            return ['success' => false, 'error' => $errMsg, 'raw' => $respBody];
        }
        if (isset($parsed['message'])) {
            $errMsg = is_array($parsed['message']) ? json_encode($parsed['message']) : $parsed['message'];
            return ['success' => false, 'error' => $errMsg, 'raw' => $respBody];
        }
    }

    if ($res['success']) {
        return ['success' => true, 'response' => $respBody];
    }

    $fallbackErr = !empty($res['error']) ? $res['error'] : (!empty($respBody) ? $respBody : 'HTTP Error ' . $res['http_code']);
    return ['success' => false, 'error' => $fallbackErr, 'raw' => $respBody];
}

function dispatchWhatsAppMessage($config, $recipientNumber, $message, $documentUrl = '', $fileName = '') {
    $provider = $config['provider'] ?? 'universal';
    $cleanNo = cleanPhoneNumber($recipientNumber);

    if (empty($cleanNo)) {
        return ['success' => false, 'error' => 'Invalid recipient phone number'];
    }

    // If universal / generic / custom gateway OR has endpoint_url configured, use Universal Engine
    if ($provider === 'universal' || $provider === 'generic' || !empty($config['endpoint_url'])) {
        return executeUniversalHttpApi($config, $recipientNumber, $message, $documentUrl, $fileName);
    }

    if ($provider === 'wasenderapi') {
        $token = trim($config['api_token'] ?? '');
        if (empty($token)) {
            return ['success' => false, 'error' => 'WasenderAPI Private Key / Access Token is required'];
        }

        $formattedTo = '+' . ltrim($cleanNo, '+');

        $url = "https://www.wasenderapi.com/api/send-message";
        $payload = [
            'to' => $formattedTo,
            'text' => $message
        ];
        if (!empty($documentUrl)) {
            $payload['documentUrl'] = $documentUrl;
            $payload['fileName'] = $fileName ?: 'Ledger_Statement.pdf';
        }

        $headers = [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json'
        ];

        $res = executeHttpRequest($url, 'POST', $headers, json_encode($payload));
        $respBody = $res['response'] ?? '';
        $parsed = json_decode($respBody, true);

        if (is_array($parsed) && !empty($parsed['success'])) {
            return ['success' => true, 'response' => $respBody];
        }

        if (is_array($parsed) && isset($parsed['message'])) {
            return ['success' => false, 'error' => $parsed['message'], 'raw' => $respBody];
        }
        if (is_array($parsed) && isset($parsed['error'])) {
            return ['success' => false, 'error' => is_array($parsed['error']) ? json_encode($parsed['error']) : $parsed['error'], 'raw' => $respBody];
        }

        return ['success' => false, 'error' => $res['error'] ?: 'WasenderAPI dispatch failed', 'raw' => $respBody];

    } elseif ($provider === 'ultramsg') {
        $instanceId = trim($config['instance_id'] ?? '');
        $token = trim($config['api_token'] ?? '');
        if (empty($instanceId) || empty($token)) {
            return ['success' => false, 'error' => 'UltraMsg Instance ID and Token are required'];
        }

        $url = "https://api.ultramsg.com/" . $instanceId . "/messages/chat";
        $params = [
            'token' => $token,
            'to' => $cleanNo,
            'body' => $message
        ];

        $res = executeHttpRequest($url, 'POST', ["Content-Type: application/x-www-form-urlencoded"], $params);
        $respBody = $res['response'] ?? '';
        $parsed = json_decode($respBody, true);

        if (is_array($parsed) && isset($parsed['error'])) {
            $errMsg = is_array($parsed['error']) ? json_encode($parsed['error']) : $parsed['error'];
            return ['success' => false, 'error' => $errMsg, 'raw' => $respBody];
        }

        if ($res['success']) {
            return ['success' => true, 'response' => $respBody];
        }

        $fallbackErr = !empty($res['error']) ? $res['error'] : (!empty($respBody) ? $respBody : 'HTTP Error ' . $res['http_code']);
        return ['success' => false, 'error' => $fallbackErr, 'raw' => $respBody];

    } elseif ($provider === 'meta_cloud') {
        $phoneId = trim($config['phone_number_id'] ?? '');
        $token = trim($config['api_token'] ?? '');
        if (empty($phoneId) || empty($token)) {
            return ['success' => false, 'error' => 'Meta Phone Number ID and Access Token are required'];
        }

        $url = "https://graph.facebook.com/v18.0/" . $phoneId . "/messages";
        $payload = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $cleanNo,
            'type' => 'text',
            'text' => ['preview_url' => false, 'body' => $message]
        ];

        $headers = [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json'
        ];

        $res = executeHttpRequest($url, 'POST', $headers, json_encode($payload));
        if ($res['success']) {
            return ['success' => true, 'response' => $res['response']];
        }
        return ['success' => false, 'error' => $res['error'] ?: 'Meta API error', 'raw' => $res['response']];

    } else {
        // Generic Webhook / Gateway
        $url = trim($config['endpoint_url'] ?? '');
        if (empty($url)) {
            return ['success' => false, 'error' => 'Custom WhatsApp Gateway URL required'];
        }

        // Replace query placeholders
        $url = str_replace(
            ['{to}', '{phone}', '{mobile}', '{body}', '{message}', '{token}'],
            [urlencode($cleanNo), urlencode($cleanNo), urlencode($cleanNo), urlencode($message), urlencode($message), urlencode($config['api_token'] ?? '')],
            $url
        );

        $res = executeHttpRequest($url, 'GET');
        return [
            'success' => $res['success'],
            'response' => $res['response'],
            'error' => $res['error']
        ];
    }
}

/**
 * Dispatcher function for SMS Gateway
 */
function dispatchSmsMessage($config, $recipientNumber, $message) {
    // Universal Dynamic Engine for SMS
    return executeUniversalHttpApi($config, $recipientNumber, $message, $documentUrl, $fileName);

    $cleanNo = cleanPhoneNumber($recipientNumber);
    $apiKey = trim($config['api_key'] ?? '');
    $apiSecret = trim($config['api_secret'] ?? '');
    $mask = trim($config['sender_id'] ?? 'SOFTIFYX');
    $method = strtoupper(trim($config['http_method'] ?? 'GET'));

    // Replacements
    $replacements = [
        '{to}' => urlencode($cleanNo),
        '{mobile}' => urlencode($cleanNo),
        '{phone}' => urlencode($cleanNo),
        '{message}' => urlencode($message),
        '{msg}' => urlencode($message),
        '{mask}' => urlencode($mask),
        '{sender}' => urlencode($mask),
        '{api_key}' => urlencode($apiKey),
        '{key}' => urlencode($apiKey),
        '{api_secret}' => urlencode($apiSecret),
        '{secret}' => urlencode($apiSecret),
        '{pass}' => urlencode($apiSecret),
        '{password}' => urlencode($apiSecret),
        '{user}' => urlencode($apiKey),
        '{username}' => urlencode($apiKey)
    ];

    if ($method === 'GET') {
        $finalUrl = str_replace(array_keys($replacements), array_values($replacements), $endpoint);
        $res = executeHttpRequest($finalUrl, 'GET');
        return [
            'success' => $res['success'],
            'response' => $res['response'],
            'error' => $res['error'] ?: ($res['success'] ? '' : 'HTTP ' . $res['http_code'])
        ];
    } elseif ($method === 'POST_JSON') {
        $headers = ['Content-Type: application/json'];
        if (!empty($apiKey)) {
            $headers[] = 'Authorization: Bearer ' . $apiKey;
        }

        $payload = [
            'to' => $cleanNo,
            'receiver' => $cleanNo,
            'message' => $message,
            'mask' => $mask,
            'sender' => $mask,
            'api_key' => $apiKey,
            'api_secret' => $apiSecret
        ];

        $res = executeHttpRequest($endpoint, 'POST', $headers, json_encode($payload));
        return [
            'success' => $res['success'],
            'response' => $res['response'],
            'error' => $res['error']
        ];
    } else {
        // POST Form
        $postParams = [
            'to' => $cleanNo,
            'receiver' => $cleanNo,
            'mobile' => $cleanNo,
            'message' => $message,
            'msg' => $message,
            'mask' => $mask,
            'sender' => $mask,
            'sender_id' => $mask,
            'api_key' => $apiKey,
            'key' => $apiKey,
            'api_secret' => $apiSecret,
            'secret' => $apiSecret,
            'username' => $apiKey,
            'password' => $apiSecret
        ];

        $headers = ['Content-Type: application/x-www-form-urlencoded'];
        $res = executeHttpRequest($endpoint, 'POST', $headers, $postParams);
        return [
            'success' => $res['success'],
            'response' => $res['response'],
            'error' => $res['error']
        ];
    }
}

/**
 * Dispatcher function for Email (SMTP)
 */
function dispatchEmailMessage($config, $recipientEmail, $subject, $messageText, $recipientName = '') {
    if (empty($recipientEmail) || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'Invalid email address: ' . $recipientEmail];
    }

    $host = trim($config['smtp_host'] ?? '');
    $port = intval($config['smtp_port'] ?? 587);
    $crypto = trim($config['smtp_crypto'] ?? 'tls');
    $user = trim($config['smtp_user'] ?? '');
    $pass = trim($config['smtp_pass'] ?? '');
    $fromEmail = trim($config['from_email'] ?? $user);
    $fromName = trim($config['from_name'] ?? 'SoftifyX Financials');

    if (empty($host)) {
        return ['success' => false, 'error' => 'SMTP Host is required'];
    }

    $bodyHtml = '
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
        <div style="background: #1F4E79; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: bold;">' . htmlspecialchars($fromName) . '</h2>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">Account Notification & Payment Reminder</div>
        </div>
        <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
            ' . nl2br(htmlspecialchars($messageText)) . '
        </div>
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 11px; color: #64748b; text-align: center;">
            This is an automated communication generated by ' . htmlspecialchars($fromName) . ' ERP System. Please contact accounts department for any queries.
        </div>
    </div>';

    return sendSmtpEmail($host, $port, $crypto, $user, $pass, $fromEmail, $fromName, $recipientEmail, $recipientName, $subject, $messageText, $bodyHtml);
}

// -----------------------------------------------------------------------------
// ROUTE DISPATCHER (Only execute if called directly via HTTP, not if included)
// -----------------------------------------------------------------------------
$isDirectCommApi = (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'communication_api.php') || 
                   (basename($_SERVER['PHP_SELF'] ?? '') === 'communication_api.php');

if ($isDirectCommApi) {

if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    // Action: Get Settings
    if ($action === 'get_settings') {
        $stmt = $pdo->prepare("SELECT channel, provider, is_enabled, config_json, updated_at FROM communication_api_settings WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $settings = [
            'whatsapp' => ['is_enabled' => 0, 'provider' => 'ultramsg', 'instance_id' => '', 'api_token' => '', 'phone_number_id' => '', 'endpoint_url' => ''],
            'sms' => ['is_enabled' => 0, 'provider' => 'generic', 'endpoint_url' => '', 'api_key' => '', 'api_secret' => '', 'sender_id' => 'SOFTIFYX', 'http_method' => 'GET'],
            'email' => ['is_enabled' => 0, 'provider' => 'smtp', 'smtp_host' => 'smtp.gmail.com', 'smtp_port' => 587, 'smtp_crypto' => 'tls', 'smtp_user' => '', 'smtp_pass' => '', 'from_name' => 'SoftifyX Financials', 'from_email' => '']
        ];

        foreach ($rows as $r) {
            $ch = $r['channel'];
            $cfg = json_decode($r['config_json'] ?? '{}', true) ?: [];
            $settings[$ch] = array_merge($settings[$ch] ?? [], $cfg, [
                'is_enabled' => intval($r['is_enabled']),
                'provider' => $r['provider'],
                'updated_at' => $r['updated_at']
            ]);
        }

        sendResponse(['status' => 'success', 'data' => $settings]);
    }

    // Action: Get Logs
    if ($action === 'get_logs') {
        $channel = $_GET['channel'] ?? 'all';
        $limit = min(200, max(10, intval($_GET['limit'] ?? 50)));

        $sql = "SELECT id, channel, recipient_type, recipient_name, recipient_contact, message_subject, message_body, status, response_payload, sent_by, sent_at FROM communication_logs WHERE company_id = ?";
        $params = [$company_id];

        if ($channel !== 'all' && !empty($channel)) {
            $sql .= " AND channel = ?";
            $params[] = $channel;
        }

        $sql .= " ORDER BY id DESC LIMIT $limit";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendResponse(['status' => 'success', 'data' => $logs]);
    }

    sendResponse(['error' => 'Invalid GET action'], 400);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $sentBy = $_SESSION['username'] ?? 'Administrator';

    // Action: Upload Generated PDF Document
    if ($action === 'upload_pdf') {
        if (empty($_FILES['pdf_file']) || $_FILES['pdf_file']['error'] !== UPLOAD_ERR_OK) {
            sendResponse(['error' => 'No PDF file uploaded or upload error occurred'], 400);
        }

        $uploadDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'ledgers' . DIRECTORY_SEPARATOR;
        if (!is_dir($uploadDir)) {
            @mkdir($uploadDir, 0777, true);
        }

        $originalName = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $_FILES['pdf_file']['name'] ?? 'ledger.pdf');
        if (!preg_match('/\.pdf$/i', $originalName)) {
            $originalName .= '.pdf';
        }

        $uniqueName = pathinfo($originalName, PATHINFO_FILENAME) . '_' . time() . '_' . rand(100, 999) . '.pdf';
        $targetPath = $uploadDir . $uniqueName;

        if (!move_uploaded_file($_FILES['pdf_file']['tmp_name'], $targetPath)) {
            sendResponse(['error' => 'Failed to save uploaded PDF file to server'], 500);
        }

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $protocol = $isHttps ? 'https://' : 'http://';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

        $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $webRoot = preg_replace('#/api/.*$#i', '', $scriptName);
        $fileUrl = $protocol . $host . rtrim($webRoot, '/') . '/uploads/ledgers/' . $uniqueName;

        sendResponse([
            'status' => 'success',
            'file_url' => $fileUrl,
            'file_name' => $uniqueName,
            'original_name' => $originalName
        ]);
    }

    // Action: Save Settings
    if ($action === 'save_settings') {
        $channel = trim($input['channel'] ?? '');
        if (!in_array($channel, ['whatsapp', 'sms', 'email'])) {
            sendResponse(['error' => 'Invalid channel specified'], 400);
        }

        $provider = trim($input['provider'] ?? 'generic');
        $isEnabled = !empty($input['is_enabled']) ? 1 : 0;
        $config = $input['config'] ?? [];

        // Mask/Preserve existing password if empty
        if ($channel === 'email' && empty($config['smtp_pass'])) {
            $stmtPrev = $pdo->prepare("SELECT config_json FROM communication_api_settings WHERE company_id = ? AND channel = ?");
            $stmtPrev->execute([$company_id, $channel]);
            $prevRow = $stmtPrev->fetch();
            if ($prevRow) {
                $prevCfg = json_decode($prevRow['config_json'], true) ?: [];
                if (!empty($prevCfg['smtp_pass'])) {
                    $config['smtp_pass'] = $prevCfg['smtp_pass'];
                }
            }
        }

        $configJson = json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $stmt = $pdo->prepare("
            INSERT INTO communication_api_settings (company_id, channel, provider, is_enabled, config_json)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                provider = VALUES(provider),
                is_enabled = VALUES(is_enabled),
                config_json = VALUES(config_json),
                updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([$company_id, $channel, $provider, $isEnabled, $configJson]);

        sendResponse(['status' => 'success', 'message' => ucfirst($channel) . ' API settings saved successfully!']);
    }

    // Action: Test Channel
    if ($action === 'test_channel') {
        $channel = trim($input['channel'] ?? '');
        $recipient = trim($input['recipient'] ?? '');
        $testMessage = trim($input['message'] ?? 'Test message from SoftifyX ERP communication system sent at ' . date('Y-m-d H:i:s'));
        $config = $input['config'] ?? [];

        // If config not provided in payload, load from DB
        if (empty($config)) {
            $stmt = $pdo->prepare("SELECT provider, config_json FROM communication_api_settings WHERE company_id = ? AND channel = ?");
            $stmt->execute([$company_id, $channel]);
            $row = $stmt->fetch();
            if ($row) {
                $config = json_decode($row['config_json'], true) ?: [];
                $config['provider'] = $row['provider'];
            }
        }

        if (empty($recipient)) {
            sendResponse(['error' => 'Recipient phone number / email is required for testing'], 400);
        }

        $res = null;
        if ($channel === 'whatsapp') {
            $res = dispatchWhatsAppMessage($config, $recipient, $testMessage);
        } elseif ($channel === 'sms') {
            $res = dispatchSmsMessage($config, $recipient, $testMessage);
        } elseif ($channel === 'email') {
            $res = dispatchEmailMessage($config, $recipient, 'SoftifyX ERP Test Email Notification', $testMessage, 'Test User');
        } else {
            sendResponse(['error' => 'Unknown channel'], 400);
        }

        // Log test
        $logStatus = !empty($res['success']) ? 'Sent' : 'Failed';
        $stmtLog = $pdo->prepare("INSERT INTO communication_logs (company_id, channel, recipient_type, recipient_name, recipient_contact, message_subject, message_body, status, response_payload, sent_by) VALUES (?, ?, 'Test', 'Test Recipient', ?, 'Test Message', ?, ?, ?, ?)");
        $stmtLog->execute([$company_id, $channel, $recipient, $testMessage, $logStatus, substr(json_encode($res), 0, 1000), $sentBy]);

        if (!empty($res['success'])) {
            sendResponse([
                'status' => 'success',
                'message' => 'Test ' . strtoupper($channel) . ' sent successfully!',
                'response' => $res['response'] ?? 'OK'
            ]);
        } else {
            sendResponse([
                'status' => 'error',
                'message' => $res['error'] ?? 'Test dispatch failed',
                'raw' => $res['raw'] ?? ''
            ], 400);
        }
    }

    // Action: Send Message (Single or Batch for Reminders / Bulk)
    if ($action === 'send_message') {
        $channel = trim($input['channel'] ?? '');
        if (!in_array($channel, ['whatsapp', 'sms', 'email'])) {
            sendResponse(['error' => 'Invalid channel specified'], 400);
        }

        // Load channel config from DB
        $stmt = $pdo->prepare("SELECT provider, is_enabled, config_json FROM communication_api_settings WHERE company_id = ? AND channel = ?");
        $stmt->execute([$company_id, $channel]);
        $row = $stmt->fetch();

        $config = $row ? (json_decode($row['config_json'], true) ?: []) : [];
        if ($row) $config['provider'] = $row['provider'];

        $hasConfig = !empty($config['endpoint_url']) || !empty($config['api_token']) || !empty($config['api_key']);
        if (!$hasConfig) {
            sendResponse(['error' => ucfirst($channel) . ' API is not configured. Please enter API credentials in System Settings.'], 400);
        }

        // Auto-enable if configured
        if ($row && empty($row['is_enabled']) && $hasConfig) {
            try {
                $pdo->prepare("UPDATE communication_api_settings SET is_enabled = 1 WHERE company_id = ? AND channel = ?")->execute([$company_id, $channel]);
            } catch (Exception $eUp) {}
        }

        // Recipients list
        $recipients = $input['recipients'] ?? [];
        if (isset($input['recipient_contact'])) {
            $recipients[] = [
                'name' => $input['recipient_name'] ?? 'Recipient',
                'contact' => $input['recipient_contact'] ?? '',
                'customer_id' => $input['customer_id'] ?? null,
                'message' => $input['message'] ?? '',
                'subject' => $input['subject'] ?? 'Payment Reminder'
            ];
        }

        if (empty($recipients)) {
            sendResponse(['error' => 'No recipients specified'], 400);
        }

        $sentCount = 0;
        $failedCount = 0;
        $results = [];

        foreach ($recipients as $rec) {
            $name = $rec['name'] ?? 'Customer';
            $contact = $rec['contact'] ?? '';
            $subject = $rec['subject'] ?? 'Payment Reminder - ' . $name;
            $msg = $rec['message'] ?? ($input['message'] ?? '');

            if (empty($contact) || empty($msg)) {
                $failedCount++;
                $results[] = ['name' => $name, 'contact' => $contact, 'status' => 'Failed', 'error' => 'Missing contact or message'];
                continue;
            }

            $res = null;
            if ($channel === 'whatsapp') {
                $docUrl = $rec['document_url'] ?? ($input['document_url'] ?? '');
            $docName = $rec['file_name'] ?? ($input['file_name'] ?? '');
            $res = dispatchWhatsAppMessage($config, $contact, $msg, $docUrl, $docName);
            } elseif ($channel === 'sms') {
                $res = dispatchSmsMessage($config, $contact, $msg);
            } elseif ($channel === 'email') {
                $res = dispatchEmailMessage($config, $contact, $subject, $msg, $name);
            }

            $status = !empty($res['success']) ? 'Sent' : 'Failed';
            if ($status === 'Sent') $sentCount++; else $failedCount++;

            // Insert into logs
            $stmtLog = $pdo->prepare("INSERT INTO communication_logs (company_id, channel, recipient_type, recipient_name, recipient_contact, message_subject, message_body, status, response_payload, sent_by) VALUES (?, ?, 'Customer', ?, ?, ?, ?, ?, ?, ?)");
            $stmtLog->execute([$company_id, $channel, $name, $contact, $subject, $msg, $status, substr(json_encode($res), 0, 1000), $sentBy]);

            // If customer_id provided, record follow-up history
            if (!empty($rec['customer_id'])) {
                try {
                    $stmtFU = $pdo->prepare("
                        INSERT INTO customer_follow_ups 
                        (customer_id, company_id, follow_up_date, contact_person, customer_response, remarks, follow_up_status, created_by)
                        VALUES (?, ?, CURDATE(), ?, ?, ?, 'Follow-up Done', ?)
                    ");
                    $stmtFU->execute([
                        $rec['customer_id'],
                        $company_id,
                        $name,
                        ucfirst($channel) . ' Reminder Sent',
                        substr($msg, 0, 250),
                        $sentBy
                    ]);
                } catch (Exception $eFU) {}
            }

            $results[] = [
                'name' => $name,
                'contact' => $contact,
                'status' => $status,
                'error' => $res['error'] ?? ''
            ];
        }

        if ($sentCount === 0) {
            $firstErr = $results[0]['error'] ?? 'Message dispatch failed';
            sendResponse([
                'status' => 'error',
                'error' => $firstErr,
                'message' => $firstErr,
                'channel' => $channel,
                'total' => count($recipients),
                'sent' => 0,
                'failed' => $failedCount,
                'details' => $results
            ], 400);
        }

        sendResponse([
            'status' => 'success',
            'channel' => $channel,
            'total' => count($recipients),
            'sent' => $sentCount,
            'failed' => $failedCount,
            'details' => $results
        ]);
    }

    sendResponse(['error' => 'Invalid POST action'], 400);
}
}
