export interface Party {
  id: string;
  company_id: string;
  name: string;
  type: 'customer' | 'vendor' | 'both';
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gst_number?: string | null;
  pan?: string | null;
  drug_license_number?: string | null;
  drug_license_expiry?: string | null;
  opening_balance?: number;
  opening_balance_type?: 'dr' | 'cr';
  is_system_account?: boolean;
  created_at: string;
  updated_at?: string;
}

const META_TAG_REGEX = /<!--META:({[\s\S]*?})-->/;

export function serializePartyAddress(dto: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  email?: string | null;
  pan?: string | null;
  drug_license_number?: string | null;
  drug_license_expiry?: string | null;
  opening_balance?: number | null;
  opening_balance_type?: 'dr' | 'cr' | null;
}): string | null {
  const meta: Record<string, any> = {};
  if (dto.email && dto.email.trim()) meta.email = dto.email.trim();
  if (dto.city && dto.city.trim()) meta.city = dto.city.trim();
  if (dto.state && dto.state.trim()) meta.state = dto.state.trim();
  if (dto.pincode && dto.pincode.trim()) meta.pincode = dto.pincode.trim();
  if (dto.pan && dto.pan.trim()) meta.pan = dto.pan.trim().toUpperCase();
  if (dto.drug_license_number && dto.drug_license_number.trim()) {
    meta.drug_license_number = dto.drug_license_number.trim();
  }
  if (dto.drug_license_expiry && dto.drug_license_expiry.trim()) {
    meta.drug_license_expiry = dto.drug_license_expiry.trim();
  }
  if (dto.opening_balance !== undefined && dto.opening_balance !== null) {
    meta.opening_balance = Number(dto.opening_balance) || 0;
  }
  if (dto.opening_balance_type) meta.opening_balance_type = dto.opening_balance_type;

  let baseAddr = (dto.address || '').replace(META_TAG_REGEX, '').trim();

  const parts: string[] = [];
  if (baseAddr) parts.push(baseAddr);
  if (dto.city && dto.city.trim() && !baseAddr.toLowerCase().includes(dto.city.trim().toLowerCase())) {
    parts.push(dto.city.trim());
  }
  if (dto.state && dto.state.trim() && !baseAddr.toLowerCase().includes(dto.state.trim().toLowerCase())) {
    parts.push(dto.state.trim());
  }
  if (dto.pincode && dto.pincode.trim() && !baseAddr.includes(dto.pincode.trim())) {
    parts.push(dto.pincode.trim());
  }

  const cleanAddress = parts.join(', ');

  if (Object.keys(meta).length > 0) {
    return cleanAddress
      ? `${cleanAddress}\n<!--META:${JSON.stringify(meta)}-->`
      : `<!--META:${JSON.stringify(meta)}-->`;
  }
  return cleanAddress || null;
}

export function formatParty(raw: any): Party {
  if (!raw) return raw;

  let email = raw.email || null;
  let city = raw.city || null;
  let state = raw.state || null;
  let pincode = raw.pincode || null;
  let pan = raw.pan || null;
  let dlNumber = raw.drug_license_number || null;
  let dlExpiry = raw.drug_license_expiry || null;
  let openingBalance =
    raw.opening_balance !== undefined && raw.opening_balance !== null
      ? Number(raw.opening_balance)
      : 0;
  let openingBalanceType: 'dr' | 'cr' = raw.opening_balance_type === 'dr' ? 'dr' : 'cr';

  let cleanAddress = raw.address || null;

  if (cleanAddress && typeof cleanAddress === 'string') {
    const match = cleanAddress.match(META_TAG_REGEX);
    if (match && match[1]) {
      try {
        const meta = JSON.parse(match[1]);
        if (!email && meta.email) email = meta.email;
        if (!city && meta.city) city = meta.city;
        if (!state && meta.state) state = meta.state;
        if (!pincode && meta.pincode) pincode = meta.pincode;
        if (!pan && meta.pan) pan = meta.pan;
        if (!dlNumber && meta.drug_license_number) dlNumber = meta.drug_license_number;
        if (!dlExpiry && meta.drug_license_expiry) dlExpiry = meta.drug_license_expiry;
        if (openingBalance === 0 && meta.opening_balance !== undefined) {
          openingBalance = Number(meta.opening_balance);
        }
        if (meta.opening_balance_type) openingBalanceType = meta.opening_balance_type;
      } catch {}
      cleanAddress = cleanAddress.replace(META_TAG_REGEX, '').trim() || null;
    }
  }

  return {
    id: raw.id,
    company_id: raw.company_id,
    name: raw.name,
    type: raw.type,
    phone: raw.phone || null,
    email: email,
    address: cleanAddress,
    city: city,
    state: state,
    pincode: pincode,
    gst_number: raw.gst_number || null,
    pan: pan,
    drug_license_number: dlNumber,
    drug_license_expiry: dlExpiry,
    opening_balance: openingBalance,
    opening_balance_type: openingBalanceType,
    is_system_account: Boolean(raw.is_system_account || raw.name?.toLowerCase() === 'cash'),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export function getDrugLicenseStatus(expiryDateStr?: string | null): {
  status: 'valid' | 'expiring_soon' | 'expired' | 'none';
  label: string;
  daysRemaining?: number;
  badgeClass?: string;
} {
  if (!expiryDateStr || !expiryDateStr.trim()) {
    return { status: 'none', label: '' };
  }

  const expiry = new Date(expiryDateStr);
  if (isNaN(expiry.getTime())) {
    return { status: 'none', label: '' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'expired',
      label: 'License expired',
      daysRemaining: diffDays,
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
    };
  }

  if (diffDays <= 30) {
    return {
      status: 'expiring_soon',
      label: `License expiring soon (${diffDays}d)`,
      daysRemaining: diffDays,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }

  return {
    status: 'valid',
    label: 'Valid',
    daysRemaining: diffDays,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
}
