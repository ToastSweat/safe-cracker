
import { execFileSync } from 'node:child_process';

export function getDatabaseKey(): Buffer {
    const dpapiFile = process.env.SAFE_CRACKER_DB_DPAPI_FILE;

    // Production: recover the key using Windows DPAPI.
    if (dpapiFile) {
        if (process.platform !== 'win32') {
            throw new Error('DPAPI key loading requires Windows.');
        }

        const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$encrypted = [System.IO.File]::ReadAllBytes(
    $env:SAFE_CRACKER_DB_DPAPI_FILE
)

$key = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $encrypted,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::LocalMachine
)

try {
    [Console]::Out.Write(
        [BitConverter]::ToString($key).Replace('-', '')
    )
}
finally {
    [Array]::Clear($key, 0, $key.Length)
}
`;

        const encodedCommand = Buffer.from(
            script,
            'utf16le'
        ).toString('base64');

        const keyHex = execFileSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-NonInteractive',
                '-EncodedCommand',
                encodedCommand
            ],
            {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 10000
            }
        ).trim();

        if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
            throw new Error('DPAPI returned an invalid database key.');
        }

        return Buffer.from(keyHex, 'hex');
    }

    // Development: temporary key supplied by PowerShell.
    const keyHex = process.env.SAFE_CRACKER_DB_KEY;

    if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
        throw new Error(
            'No valid database encryption key configured.'
        );
    }

    return Buffer.from(keyHex, 'hex');
}
