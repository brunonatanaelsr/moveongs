alter table attachments
  add column if not exists antivirus_scan_status text,
  add column if not exists antivirus_scan_signature text,
  add column if not exists antivirus_scan_message text,
  add column if not exists antivirus_scanned_at timestamptz;
