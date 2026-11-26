<?php
/**
 * Shared Encrypted Two-Factor & Master 4-Digit Security PIN Engine
 * - Global tables without company_id so Clear Transactions never erases security config/tokens.
 * - Auto-seeds default PIN '1234' (hashed) ONLY on initial table/row creation when unset.
 */

if (!function_exists('ensureSecurityPinTables')) {
    function ensureSecurityPinTables($pdo) {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS app_security_pin_config (
                id INT PRIMARY KEY,
                pin_hash VARCHAR(255) NOT NULL,
                pin_on_login TINYINT(1) NOT NULL DEFAULT 1,
                pin_on_balance_sheet TINYINT(1) NOT NULL DEFAULT 1,
                pin_on_clear_tx TINYINT(1) NOT NULL DEFAULT 1,
                failed_attempts INT NOT NULL DEFAULT 0,
                locked_until DATETIME NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS app_security_pin_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token_hash VARCHAR(64) NOT NULL,
                user_id INT NOT NULL,
                scope VARCHAR(40) NOT NULL,
                expires_at DATETIME NOT NULL,
                revoked TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_security_pin_tok (token_hash),
                INDEX idx_security_tok_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");

        // Auto-seed default PIN '1234' ONLY when row id = 1 does not exist yet
        $chk = $pdo->query("SELECT COUNT(*) FROM app_security_pin_config WHERE id = 1")->fetchColumn();
        if (intval($chk) === 0) {
            $defaultHash = password_hash('1234', PASSWORD_DEFAULT);
            $ins = $pdo->prepare("
                INSERT IGNORE INTO app_security_pin_config
                    (id, pin_hash, pin_on_login, pin_on_balance_sheet, pin_on_clear_tx)
                VALUES (1, ?, 1, 1, 1)
            ");
            $ins->execute([$defaultHash]);
        }
    }
}

if (!function_exists('getSecurityPinSettings')) {
    function getSecurityPinSettings($pdo) {
        ensureSecurityPinTables($pdo);
        $stmt = $pdo->query("SELECT pin_on_login, pin_on_balance_sheet, pin_on_clear_tx, updated_at FROM app_security_pin_config WHERE id = 1 LIMIT 1");
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        return [
            'pin_configured' => !empty($row),
            'pin_on_login' => !empty($row['pin_on_login']),
            'pin_on_balance_sheet' => !empty($row['pin_on_balance_sheet']),
            'pin_on_clear_tx' => !empty($row['pin_on_clear_tx']),
            'updated_at' => $row['updated_at'] ?? null
        ];
    }
}

if (!function_exists('verifyMasterSecurityPin')) {
    function verifyMasterSecurityPin($pdo, $inputPin, $enforceLockout = true) {
        ensureSecurityPinTables($pdo);
        $pin = trim((string)$inputPin);
        if (!preg_match('/^\d{4}$/', $pin)) {
            return ['ok' => false, 'status_code' => 400, 'error' => 'Please enter a valid 4-digit numeric Security PIN.'];
        }

        $stmt = $pdo->query("SELECT pin_hash, failed_attempts, locked_until FROM app_security_pin_config WHERE id = 1 LIMIT 1");
        $cfg = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if (!$cfg || empty($cfg['pin_hash'])) {
            return ['ok' => false, 'status_code' => 500, 'error' => 'Security PIN is not configured.'];
        }

        if ($enforceLockout && !empty($cfg['locked_until'])) {
            $lockTs = strtotime($cfg['locked_until']);
            if ($lockTs && $lockTs > time()) {
                $remMin = ceil(($lockTs - time()) / 60);
                return [
                    'ok' => false,
                    'status_code' => 429,
                    'is_locked' => true,
                    'error' => "Security PIN temporarily locked due to repeated invalid attempts. Try again in {$remMin} minute(s)."
                ];
            }
        }

        if (password_verify($pin, $cfg['pin_hash'])) {
            $pdo->exec("UPDATE app_security_pin_config SET failed_attempts = 0, locked_until = NULL WHERE id = 1");
            return ['ok' => true];
        }

        usleep(350000);
        $attempts = intval($cfg['failed_attempts'] ?? 0) + 1;
        if ($enforceLockout && $attempts >= 5) {
            $pdo->prepare("UPDATE app_security_pin_config SET failed_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = 1")
                ->execute([$attempts]);
            return [
                'ok' => false,
                'status_code' => 429,
                'is_locked' => true,
                'error' => 'Incorrect Security PIN entered 5 times. Locked for 10 minutes.'
            ];
        }

        $pdo->prepare("UPDATE app_security_pin_config SET failed_attempts = ? WHERE id = 1")->execute([$attempts]);
        $rem = max(0, 5 - $attempts);
        return [
            'ok' => false,
            'status_code' => 401,
            'remaining_attempts' => $rem,
            'error' => "Incorrect 4-Digit Security PIN! ({$rem} attempt(s) left before cooldown)."
        ];
    }
}

if (!function_exists('updateMasterSecurityPinSettings')) {
    function updateMasterSecurityPinSettings($pdo, $flags, $newPin = null) {
        ensureSecurityPinTables($pdo);
        $onLogin = !empty($flags['pin_on_login']) ? 1 : 0;
        $onBs = !empty($flags['pin_on_balance_sheet']) ? 1 : 0;
        $onClear = !empty($flags['pin_on_clear_tx']) ? 1 : 0;

        $newPinTrim = ($newPin === null) ? '' : trim((string)$newPin);
        if ($newPinTrim !== '') {
            if (!preg_match('/^\d{4}$/', $newPinTrim)) {
                return ['ok' => false, 'error' => 'Security PIN must be exactly 4 numeric digits (0-9).'];
            }
            $newHash = password_hash($newPinTrim, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("
                UPDATE app_security_pin_config
                SET pin_hash = ?, pin_on_login = ?, pin_on_balance_sheet = ?, pin_on_clear_tx = ?, failed_attempts = 0, locked_until = NULL
                WHERE id = 1
            ");
            $stmt->execute([$newHash, $onLogin, $onBs, $onClear]);
        } else {
            $stmt = $pdo->prepare("
                UPDATE app_security_pin_config
                SET pin_on_login = ?, pin_on_balance_sheet = ?, pin_on_clear_tx = ?
                WHERE id = 1
            ");
            $stmt->execute([$onLogin, $onBs, $onClear]);
        }

        return ['ok' => true, 'settings' => getSecurityPinSettings($pdo)];
    }
}

if (!function_exists('issueSecurityActionPinToken')) {
    function issueSecurityActionPinToken($pdo, $userId, $scope) {
        ensureSecurityPinTables($pdo);
        try {
            $pdo->exec("DELETE FROM app_security_pin_tokens WHERE expires_at < NOW() OR revoked = 1");
        } catch (Exception $e) {}

        $rawToken = bin2hex(random_bytes(24));
        $tokHash = hash('sha256', $rawToken);
        $stmt = $pdo->prepare("
            INSERT INTO app_security_pin_tokens (token_hash, user_id, scope, expires_at, revoked)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 4 HOUR), 0)
        ");
        $stmt->execute([$tokHash, intval($userId), substr(trim((string)$scope), 0, 40)]);
        return $rawToken;
    }
}

if (!function_exists('validateSecurityActionPinToken')) {
    function validateSecurityActionPinToken($pdo, $rawToken, $userId, $scope) {
        ensureSecurityPinTables($pdo);
        $tok = trim((string)$rawToken);
        if ($tok === '') return false;
        $tokHash = hash('sha256', $tok);
        $stmt = $pdo->prepare("
            SELECT id FROM app_security_pin_tokens
            WHERE token_hash = ? AND user_id = ? AND scope = ? AND revoked = 0 AND expires_at > NOW()
            LIMIT 1
        ");
        $stmt->execute([$tokHash, intval($userId), trim((string)$scope)]);
        return (bool)$stmt->fetchColumn();
    }
}

if (!function_exists('revokeSecurityActionPinToken')) {
    function revokeSecurityActionPinToken($pdo, $rawToken, $scope = null) {
        ensureSecurityPinTables($pdo);
        $tok = trim((string)$rawToken);
        if ($tok === '') return;
        $tokHash = hash('sha256', $tok);
        if ($scope !== null) {
            $stmt = $pdo->prepare("UPDATE app_security_pin_tokens SET revoked = 1 WHERE token_hash = ? AND scope = ?");
            $stmt->execute([$tokHash, trim((string)$scope)]);
        } else {
            $stmt = $pdo->prepare("UPDATE app_security_pin_tokens SET revoked = 1 WHERE token_hash = ?");
            $stmt->execute([$tokHash]);
        }
    }
}

if (!function_exists('resolveMainAdministratorUser')) {
    /**
     * Resolves active user strictly favoring PHP $_SESSION over fallback current_user_id,
     * and checks whether the resolved account is the active Main Administrator (id=1 / Administrator).
     */
    function resolveMainAdministratorUser($pdo, $fallbackUserId = 0) {
        $sessUserId = intval($_SESSION['user_id'] ?? 0);
        $reqUserId = intval($fallbackUserId ?: ($_GET['current_user_id'] ?? ($_POST['current_user_id'] ?? 0)));
        $lookupId = ($sessUserId > 0) ? $sessUserId : $reqUserId;

        $resolvedId = 0;
        $resolvedUsername = '';
        $isActive = true;

        if ($lookupId > 0) {
            try {
                $uStmt = $pdo->prepare("SELECT id, username, status FROM users WHERE id = ? LIMIT 1");
                $uStmt->execute([$lookupId]);
                $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
                if ($uRow) {
                    $resolvedId = intval($uRow['id']);
                    $resolvedUsername = trim((string)($uRow['username'] ?? ''));
                    $stLow = strtolower(trim((string)($uRow['status'] ?? 'active')));
                    $isActive = ($stLow === '' || $stLow === 'active' || $stLow === '1');
                    if (!$sessUserId && session_status() === PHP_SESSION_ACTIVE) {
                        $_SESSION['user_id'] = $resolvedId;
                        $_SESSION['username'] = $resolvedUsername;
                    }
                }
            } catch (Exception $e) {}
        } elseif (!empty($_SESSION['username'])) {
            $resolvedId = $sessUserId;
            $resolvedUsername = trim((string)$_SESSION['username']);
        }

        $isAuthenticated = ($resolvedId > 0 || $resolvedUsername !== '');
        $isMainAdmin = ($isAuthenticated && $isActive && ($resolvedId === 1 || strcasecmp($resolvedUsername, 'Administrator') === 0));

        return [
            'authenticated' => $isAuthenticated,
            'is_main_admin' => $isMainAdmin,
            'id' => $resolvedId,
            'username' => $resolvedUsername
        ];
    }
}
