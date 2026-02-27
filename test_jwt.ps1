# Script de Teste JWT para PluckLog
# Uso: .\test_jwt.ps1

$BaseUrl = "http://localhost:8000"
$Email = "admin@pluck.local"
$Password = "Admin@123"

Write-Host "--- Passo 1: Login e Captura do Token ---" -ForegroundColor Cyan
$LoginUrl = "$BaseUrl/api/auth/login"
$Body = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

try {
    $Response = Invoke-RestMethod -Uri $LoginUrl -Method Post -Body $Body -ContentType "application/json" -ErrorAction Stop
    $Token = $Response.access_token
    Write-Host "✅ Login com sucesso!" -ForegroundColor Green
    Write-Host "Token capturado (primeiros 20 chars): $($Token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "❌ Falha no login: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host "`n--- Passo 2: Acesso a Rota Protegida com Token ---" -ForegroundColor Cyan
$ProtectedUrl = "$BaseUrl/api/usuarios"
$Headers = @{
    Authorization = "Bearer $Token"
}

try {
    $Users = Invoke-RestMethod -Uri $ProtectedUrl -Method Get -Headers $Headers -ErrorAction Stop
    Write-Host "✅ Acesso autorizado! Usuários encontrados: $($Users.Count)" -ForegroundColor Green
} catch {
    Write-Host "❌ Falha no acesso protegido: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n--- Passo 3: Teste de Bloqueio (X-User-Id sem Token) ---" -ForegroundColor Cyan
# Tentando acessar sem token, apenas com o header antigo
$HeadersOld = @{
    "X-User-Id" = "algum-id-qualquer"
}

try {
    $Result = Invoke-RestMethod -Uri $ProtectedUrl -Method Get -Headers $HeadersOld -ErrorAction Stop
    Write-Host "❌ ERRO: A rota aceitou a requisição sem token JWT!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::Unauthorized) {
        Write-Host "✅ Bloqueio confirmado! Resposta 401 Unauthorized recebida." -ForegroundColor Green
    } else {
        Write-Host "⚠️ Resposta inesperada: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}

Write-Host "`n--- Passo 4: Teste de Token Inválido ---" -ForegroundColor Cyan
$HeadersInvalid = @{
    Authorization = "Bearer token-invalido-123"
}

try {
    $Result = Invoke-RestMethod -Uri $ProtectedUrl -Method Get -Headers $HeadersInvalid -ErrorAction Stop
    Write-Host "❌ ERRO: Token inválido foi aceito!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::Unauthorized) {
        Write-Host "✅ Rejeição confirmada! Token inválido retornou 401." -ForegroundColor Green
    } else {
        Write-Host "⚠️ Resposta inesperada: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}
