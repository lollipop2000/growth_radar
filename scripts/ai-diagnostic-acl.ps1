param([Parameter(Mandatory=$true)][string]$Path,[switch]$Verify)
$ErrorActionPreference='Stop'
try {
  $item=Get-Item -LiteralPath $Path -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE_POINT'}
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  if(-not $Verify){
    if($item.PSIsContainer){$acl=[IO.Directory]::GetAccessControl($Path)}
    else {$acl=[IO.File]::GetAccessControl($Path)}
    $acl.SetAccessRuleProtection($true,$false)
    foreach($existing in @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))){$acl.RemoveAccessRuleSpecific($existing)}
    if($item.PSIsContainer){
      $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    } else {
      $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')
    }
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule($rule)
    # Persist only modified access/owner sections. Windows PowerShell Set-Acl
    # can request audit privileges even though no SACL is being changed.
    if($item.PSIsContainer){[IO.Directory]::SetAccessControl($Path,$acl)}
    else {[IO.File]::SetAccessControl($Path,$acl)}
  }
  if($item.PSIsContainer){$actual=[IO.Directory]::GetAccessControl($Path)}
  else {$actual=[IO.File]::GetAccessControl($Path)}
  if(-not $actual.AreAccessRulesProtected){throw 'INHERITED_ACL'}
  if($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'FOREIGN_OWNER'}
  $rules=$actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
  if($rules.Count -ne 1){throw 'EXTRA_ACL'}
  if($rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl'){throw 'UNSAFE_ACL'}
  Write-Output 'ACL_OK'
} catch { Write-Output 'ACL_DENIED'; exit 1 }
