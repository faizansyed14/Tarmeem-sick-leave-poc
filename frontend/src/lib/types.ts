export type Role = "admin" | "user";
export type MfaMethod = "captcha" | "email_otp" | "authenticator";

export const MFA_OPTIONS: { value: MfaMethod; label: string; description: string }[] = [
  { value: "captcha", label: "Captcha", description: "Type the characters shown in an image" },
  { value: "email_otp", label: "Email OTP", description: "6 digit code sent by email" },
  { value: "authenticator", label: "Microsoft Authenticator", description: "6 digit code from the authenticator app" },
];

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  mfa_method: MfaMethod;
  totp_enabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  emirates_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export type LeaveStatus = "verified" | "not_verified" | "awaiting_otp";

export interface LeaveSummary {
  id: number;
  reference: string;
  original_filename: string;
  file_type: "pdf" | "docx";
  patient_name: string | null;
  emirates_id: string | null;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  customer: Customer | null;
  status: LeaveStatus;
  uploaded_by: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface OtpState {
  sent_to: string;
  sent_at: string;
  expires_at: string;
  active: boolean;
  expired: boolean;
  locked: boolean;
  verified: boolean;
  attempts_remaining: number;
  resend_available_in: number;
}

export interface Candidate {
  customer: Customer;
  score: number;
  method: "emirates_id" | "name";
  note: string;
}

export interface LeaveDetail extends LeaveSummary {
  file_size: number;
  extracted: {
    patient_name: string | null;
    emirates_id: string | null;
    start_date: string | null;
    end_date: string | null;
    days: number | null;
    facility: string | null;
    doctor: string | null;
    certificate_no: string | null;
    issue_date: string | null;
  };
  text_preview: string;
  extraction_method: "text" | "ocr";
  match_method: "emirates_id" | "name" | "manual" | null;
  match_score: number | null;
  verified_by: string | null;
  otp: OtpState | null;
  sheet: { sent_at: string; sent_to: string } | null;
  candidates: Candidate[];
  dev_code?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Activity {
  id: number;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
  user: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface ImportRow {
  row: number;
  emirates_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  errors: string[];
  warnings: string[];
  status: "new" | "exists" | "exists_changed" | "duplicate_in_file" | "invalid";
  changes: string[];
}

export interface ImportPreview {
  token: string;
  filename: string;
  columns: string[];
  summary: {
    total: number;
    new: number;
    exists: number;
    exists_changed: number;
    duplicate_in_file: number;
    invalid: number;
    with_warnings: number;
  };
  rows: ImportRow[];
}

export interface ImportBatch {
  id: number;
  filename: string;
  uploaded_by: string | null;
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  created_at: string;
}
