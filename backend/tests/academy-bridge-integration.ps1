$ErrorActionPreference = 'Stop'
$base = if ($env:ROOM_FUNCTIONS_URL) { $env:ROOM_FUNCTIONS_URL.TrimEnd('/') } else { 'http://127.0.0.1:54321/functions/v1' }
$secret = $env:ACADEMY_BRIDGE_SECRET
if (-not $secret) { throw 'ACADEMY_BRIDGE_SECRET is required' }
$bridgeHeaders = @{ 'x-academy-bridge-secret' = $secret }

function Invoke-Bridge([string]$Path, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri "$base/academy-bridge/$Path" -Headers $bridgeHeaders `
    -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress)
}
function Invoke-ExpectedStatus([string]$Path, [hashtable]$Body, [int]$Status) {
  $response = Invoke-WebRequest -Method Post -Uri "$base/academy-bridge/$Path" -Headers $bridgeHeaders `
    -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress) -SkipHttpErrorCheck
  if ($response.StatusCode -ne $Status) { throw "$Path returned $($response.StatusCode), expected $Status" }
}

$academySessionId = "academy-integration-$([guid]::NewGuid())"
$provision = @{
  academySessionId = $academySessionId; teacherId = 'teacher-1'; cohortId = 'cohort-1'
  title = 'Synthetic Academy Class'; scheduledAt = '2026-11-16T16:30:00.000Z'
}
$first = Invoke-Bridge 'provision' $provision
$again = Invoke-Bridge 'provision' $provision
if ($first.data.session_id -ne $again.data.session_id) { throw 'Duplicate provisioning created another session' }
Invoke-Bridge 'start' @{ academySessionId = $academySessionId; teacherId = 'teacher-1' } | Out-Null
Invoke-Bridge 'start' @{ academySessionId = $academySessionId; teacherId = 'teacher-1' } | Out-Null
Invoke-ExpectedStatus 'join-intent' @{
  academySessionId = $academySessionId; userId = 'teacher-2'; displayName = 'Wrong Teacher'; role = 'host'
} 403

$intent = Invoke-Bridge 'join-intent' @{
  academySessionId = $academySessionId; userId = 'student-1'; displayName = 'Synthetic Student'; role = 'audience'
}
$token = ([uri]$intent.data.url).Query.Substring(7)
$redeem = Invoke-RestMethod -Method Post -Uri "$base/academy-bridge/redeem" -ContentType 'application/json' `
  -Body (@{ token = $token } | ConvertTo-Json -Compress)
$used = Invoke-WebRequest -Method Post -Uri "$base/academy-bridge/redeem" -ContentType 'application/json' `
  -Body (@{ token = $token } | ConvertTo-Json -Compress) -SkipHttpErrorCheck
if ($used.StatusCode -ne 401) { throw 'Single-use credential was accepted twice' }

$expiredToken = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')).ToLowerInvariant()
$expiredHash = [Convert]::ToHexString(
  [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($expiredToken))
).ToLowerInvariant()
$expirySql = @"
insert into public.academy_join_intents
  (token_hash, academy_session_id, external_user_id, display_name, room_role, expires_at)
values ('$expiredHash', '$academySessionId', 'expired-student', 'Expired Student', 'audience', now() - interval '1 minute');
"@
$expirySql | docker exec -i supabase_db_backend psql -v ON_ERROR_STOP=1 -U postgres -d postgres | Out-Null
$expired = Invoke-WebRequest -Method Post -Uri "$base/academy-bridge/redeem" -ContentType 'application/json' `
  -Body (@{ token = $expiredToken } | ConvertTo-Json -Compress) -SkipHttpErrorCheck
if ($expired.StatusCode -ne 401) { throw 'Expired credential was accepted' }

$auth = @{ Authorization = "Bearer $($redeem.data.session.access_token)" }
$joined = Invoke-RestMethod -Method Post -Uri "$base/rooms/join" -Headers $auth -ContentType 'application/json' `
  -Body (@{ slug = $redeem.data.slug; displayName = 'Synthetic Student' } | ConvertTo-Json -Compress)
$roomSessionId = $joined.data.session_id
1..2 | ForEach-Object {
  Invoke-RestMethod -Method Post -Uri "$base/sessions/$roomSessionId/join" -Headers $auth -ContentType 'application/json' -Body '{}' | Out-Null
}
Start-Sleep -Seconds 1
1..2 | ForEach-Object {
  Invoke-RestMethod -Method Post -Uri "$base/sessions/$roomSessionId/leave" -Headers $auth -ContentType 'application/json' -Body '{}' | Out-Null
}
$ended = Invoke-Bridge 'end' @{ academySessionId = $academySessionId; teacherId = 'teacher-1' }
$endedAgain = Invoke-Bridge 'end' @{ academySessionId = $academySessionId; teacherId = 'teacher-1' }
if ($ended.data.attendance.Count -ne 1 -or $endedAgain.data.attendance.Count -ne 1) {
  throw 'Attendance reconciliation failed'
}

$cancelledId = "academy-cancelled-$([guid]::NewGuid())"
Invoke-Bridge 'provision' @{
  academySessionId = $cancelledId; teacherId = 'teacher-1'; cohortId = 'cohort-1'
  title = 'Cancelled Synthetic Class'; scheduledAt = '2026-11-17T16:30:00.000Z'
} | Out-Null
Invoke-Bridge 'start' @{ academySessionId = $cancelledId; teacherId = 'teacher-1' } | Out-Null
$cancelIntent = Invoke-Bridge 'join-intent' @{
  academySessionId = $cancelledId; userId = 'student-1'; displayName = 'Synthetic Student'; role = 'audience'
}
$cancelToken = ([uri]$cancelIntent.data.url).Query.Substring(7)
Invoke-Bridge 'cancel' @{ academySessionId = $cancelledId; teacherId = 'teacher-1' } | Out-Null
Invoke-ExpectedStatus 'join-intent' @{
  academySessionId = $cancelledId; userId = 'student-1'; displayName = 'Synthetic Student'; role = 'audience'
} 409
$cancelRedeem = Invoke-WebRequest -Method Post -Uri "$base/academy-bridge/redeem" -ContentType 'application/json' `
  -Body (@{ token = $cancelToken } | ConvertTo-Json -Compress) -SkipHttpErrorCheck
if ($cancelRedeem.StatusCode -ne 401) { throw 'Pre-issued credential survived cancellation' }

Write-Output 'PASS provision-idempotent,start-idempotent,teacher-auth,single-use,expiry,private-join,duplicate-events,end-idempotent,cancel-rejection'
