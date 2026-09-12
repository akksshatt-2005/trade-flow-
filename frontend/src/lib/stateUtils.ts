const GST_STATE_CODES: Record<string, string> = {
  "01": "jammu and kashmir",
  "02": "himachal pradesh",
  "03": "punjab",
  "04": "chandigarh",
  "05": "uttarakhand",
  "06": "haryana",
  "07": "delhi",
  "08": "rajasthan",
  "09": "uttar pradesh",
  "10": "bihar",
  "11": "sikkim",
  "12": "arunachal pradesh",
  "13": "nagaland",
  "14": "manipur",
  "15": "mizoram",
  "16": "tripura",
  "17": "meghalaya",
  "18": "assam",
  "19": "west bengal",
  "20": "jharkhand",
  "21": "odisha",
  "22": "chhattisgarh",
  "23": "madhya pradesh",
  "24": "gujarat",
  "27": "maharashtra",
  "29": "karnataka",
  "30": "goa",
  "32": "kerala",
  "33": "tamil nadu",
  "36": "telangana",
  "37": "andhra pradesh",
};

const KNOWN_STATES = [
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat",
  "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh",
  "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "punjab",
  "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
  "west bengal", "delhi", "chandigarh", "jammu & kashmir", "ladakh", "puducherry",
];

export function resolveState(entity?: { gst_number?: string | null; address?: string | null; state?: string | null } | null): string {
  if (!entity) return "";
  if (entity.state && entity.state.trim()) {
    return entity.state.trim().toLowerCase();
  }
  if (entity.gst_number && entity.gst_number.trim().length >= 2) {
    const code = entity.gst_number.trim().substring(0, 2);
    if (GST_STATE_CODES[code]) {
      return GST_STATE_CODES[code];
    }
  }
  if (entity.address && entity.address.trim()) {
    const addrLower = entity.address.trim().toLowerCase();
    for (const st of KNOWN_STATES) {
      if (addrLower.includes(st)) {
        return st;
      }
    }
    return addrLower;
  }
  return "";
}
