"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { Modal } from "./modal";
import { Alert, Button, Field, Input } from "./ui";

type Initial = { emirates_id?: string | null; full_name?: string | null };

/** Formats typed digits as 784-XXXX-XXXXXXX-X while the user types. */
function formatEid(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 15);
  const parts = [d.slice(0, 3), d.slice(3, 7), d.slice(7, 14), d.slice(14, 15)].filter(Boolean);
  return parts.join("-");
}

/**
 * Add a customer, or edit one when `customer` is given.
 * Validation (Emirates ID format, duplicates, email and phone) runs on the server.
 */
export function CustomerFormModal({
  open,
  onClose,
  onSaved,
  customer,
  initial,
  submitLabel,
  eidLocked,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (customer: Customer, warnings: string[]) => void | Promise<void>;
  customer?: Customer | null;
  initial?: Initial;
  submitLabel?: string;
  eidLocked?: string | null;
}) {
  const editing = !!customer;
  const [eid, setEid] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEid(formatEid(customer?.emirates_id ?? initial?.emirates_id ?? ""));
    setName(customer?.full_name ?? initial?.full_name ?? "");
    setEmail(customer?.email ?? "");
    setPhone(customer?.phone ?? "");
    setError(null);
  }, [open, customer, initial?.emirates_id, initial?.full_name]);

  const digits = eid.replace(/\D/g, "");
  const eidValid = digits.length === 15 && digits.startsWith("784");
  const valid = eidValid && name.trim().length >= 2;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const body = { emirates_id: eid, full_name: name, email: email || null, phone: phone || null };
      const r = editing
        ? await api<{ customer: Customer; warnings: string[] }>(`/customers/${customer!.id}`, { method: "PUT", body })
        : await api<{ customer: Customer; warnings: string[] }>("/customers", { body });
      await onSaved(r.customer, r.warnings);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit customer" : "Add customer"}
      description={
        editing
          ? "Changes are recorded in the audit log."
          : "Add a single customer to the register. For many customers at once, use the spreadsheet import."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>
            {submitLabel ?? (editing ? "Save changes" : "Add customer")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && <Alert tone="bad">{error}</Alert>}
        <Field
          label="Emirates ID"
          error={digits.length === 15 && !eidValid ? "Emirates IDs start with 784" : null}
          hint={eidLocked ?? "15 digits, dashes are added for you"}
        >
          <Input
            value={eid}
            onChange={(e) => setEid(formatEid(e.target.value))}
            placeholder="784-0000-0000000-0"
            className="font-mono tracking-tight"
            inputMode="numeric"
            disabled={!!eidLocked}
          />
        </Field>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As shown on the Emirates ID" />
        </Field>
        <Field label="Email" hint="Needed to send the verification code">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Mobile number">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050 123 4567" className="tabular" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Kept for existing callers: the add only form. */
export function AddCustomerModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer, warnings: string[]) => void | Promise<void>;
  initial?: Initial;
  submitLabel?: string;
}) {
  return <CustomerFormModal open={props.open} onClose={props.onClose} onSaved={props.onCreated} initial={props.initial} submitLabel={props.submitLabel} />;
}
