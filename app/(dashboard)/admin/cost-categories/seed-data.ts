export const SEED_CATEGORIES: {
  name: string;
  code: string;
  description: string;
  display_order: number;
}[] = [
  // LAND ACQUISITION
  { name: "Acquisition Costs", code: "000100", description: "LAND ACQUISITION", display_order: 10 },
  { name: "Acquisition Closing Costs", code: "000200", description: "LAND ACQUISITION", display_order: 20 },
  { name: "Other Acquisition Cost", code: "000900", description: "LAND ACQUISITION", display_order: 30 },

  // ARCHITECTURE and ENGINEERING COSTS
  { name: "Architectural Design", code: "010100", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 40 },
  { name: "Civil Engineering", code: "010200", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 50 },
  { name: "Landscape Design", code: "010300", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 60 },
  { name: "MEP Engineering", code: "010400", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 70 },
  { name: "Renderings, Exhibits, LODs", code: "010500", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 80 },
  { name: "Structural Design", code: "010600", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 90 },
  { name: "Survey", code: "010700", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 100 },
  { name: "Other A&E Costs", code: "010900", description: "ARCHITECTURE AND ENGINEERING COSTS", display_order: 110 },

  // CONSULTANT COSTS
  { name: "Branding, Signage & Graphics Consultant", code: "020100", description: "CONSULTANT COSTS", display_order: 120 },
  { name: "Capital Markets Consultant", code: "020200", description: "CONSULTANT COSTS", display_order: 130 },
  { name: "Environmental Consultant", code: "020300", description: "CONSULTANT COSTS", display_order: 140 },
  { name: "Geotech Consultant", code: "020400", description: "CONSULTANT COSTS", display_order: 150 },
  { name: "IT/AV/Security Consultants", code: "020500", description: "CONSULTANT COSTS", display_order: 160 },
  { name: "Preconstruction Consultant", code: "020600", description: "CONSULTANT COSTS", display_order: 170 },
  { name: "Procurement Consultant", code: "020610", description: "CONSULTANT COSTS", display_order: 180 },
  { name: "Public Relations Consultant", code: "020620", description: "CONSULTANT COSTS", display_order: 190 },
  { name: "Market Study Consultant", code: "020700", description: "CONSULTANT COSTS", display_order: 200 },
  { name: "Materials Testing Consultant", code: "020710", description: "CONSULTANT COSTS", display_order: 210 },
  { name: "Traffic, Parking, Zoning Consultant", code: "020800", description: "CONSULTANT COSTS", display_order: 220 },
  { name: "Other Consultants", code: "020900", description: "CONSULTANT COSTS", display_order: 230 },

  // ENTITLEMENT AND PERMIT COSTS
  { name: "Impact Fees", code: "030100", description: "ENTITLEMENT AND PERMIT COSTS", display_order: 240 },
  { name: "License Fees", code: "030200", description: "ENTITLEMENT AND PERMIT COSTS", display_order: 250 },
  { name: "Permits (Demo, Site, Building)", code: "030300", description: "ENTITLEMENT AND PERMIT COSTS", display_order: 260 },
  { name: "Plan Review Fees", code: "030400", description: "ENTITLEMENT AND PERMIT COSTS", display_order: 270 },
  { name: "Sewer Tap & Inspection fees / Utilities", code: "030500", description: "ENTITLEMENT AND PERMIT COSTS", display_order: 280 },
  { name: "Other Entitlement and Permit Costs", code: "030900", description: "ENTITLEMENT AND PERMIT COSTS", display_order: 290 },

  // CARRYING COSTS
  { name: "Owner Association Fees", code: "040100", description: "CARRYING COSTS", display_order: 300 },
  { name: "Real Estate Taxes", code: "040200", description: "CARRYING COSTS", display_order: 310 },
  { name: "Utilities", code: "040300", description: "CARRYING COSTS", display_order: 320 },
  { name: "Other Carrying Costs", code: "040900", description: "CARRYING COSTS", display_order: 330 },

  // DEVELOPMENT FEE COSTS
  { name: "Developer Fee", code: "050100", description: "DEVELOPMENT FEE COSTS", display_order: 340 },
  { name: "Guarantee Fee", code: "050200", description: "DEVELOPMENT FEE COSTS", display_order: 350 },
  { name: "Owner Representation Fee", code: "050300", description: "DEVELOPMENT FEE COSTS", display_order: 360 },
  { name: "SRES Fee", code: "050400", description: "DEVELOPMENT FEE COSTS", display_order: 370 },
  { name: "Other Development Fees", code: "050900", description: "DEVELOPMENT FEE COSTS", display_order: 380 },

  // LEGAL COSTS
  { name: "Legal & Professional - General", code: "802100", description: "LEGAL COSTS", display_order: 390 },
  { name: "Legal & Professional - Employment", code: "802101", description: "LEGAL COSTS", display_order: 400 },
  { name: "Legal & Professional - Acquisition", code: "802102", description: "LEGAL COSTS", display_order: 410 },
  { name: "Legal & Professional - Securities", code: "802103", description: "LEGAL COSTS", display_order: 420 },
  { name: "Legal & Professional - Entitlements", code: "802104", description: "LEGAL COSTS", display_order: 430 },
  { name: "Legal & Professional - Incentives", code: "802105", description: "LEGAL COSTS", display_order: 440 },
  { name: "Legal & Professional - Lobbying", code: "802106", description: "LEGAL COSTS", display_order: 450 },
  { name: "Legal & Professional - Environmental", code: "802107", description: "LEGAL COSTS", display_order: 460 },
  { name: "Legal & Professional - Financing", code: "802108", description: "LEGAL COSTS", display_order: 470 },
  { name: "Legal & Professional - Commercial Leasing", code: "802109", description: "LEGAL COSTS", display_order: 480 },
  { name: "Legal & Professional - Disputes", code: "802110", description: "LEGAL COSTS", display_order: 490 },
  { name: "Legal & Professional - Sale", code: "802111", description: "LEGAL COSTS", display_order: 500 },
  { name: "Legal & Professional - Deals", code: "802119", description: "LEGAL COSTS", display_order: 510 },

  // LEASING AND SALES COSTS
  { name: "Lease - Commissions", code: "070100", description: "LEASING AND SALES COSTS", display_order: 520 },
  { name: "Sales - Commissions", code: "070200", description: "LEASING AND SALES COSTS", display_order: 530 },
  { name: "Sales - Closing Costs", code: "070300", description: "LEASING AND SALES COSTS", display_order: 540 },
  { name: "Other Leasing and Sales Costs", code: "070900", description: "LEASING AND SALES COSTS", display_order: 550 },

  // INSURANCE
  { name: "Bonds/Letter of Credit", code: "080100", description: "INSURANCE", display_order: 560 },
  { name: "Builders Risk", code: "080200", description: "INSURANCE", display_order: 570 },
  { name: "General Liability", code: "080300", description: "INSURANCE", display_order: 580 },
  { name: "Other Insurance Costs", code: "080900", description: "INSURANCE", display_order: 590 },

  // PREOPENING COSTS
  { name: "Admin & General", code: "090100", description: "PREOPENING COSTS", display_order: 600 },
  { name: "Reimbursables", code: "090200", description: "PREOPENING COSTS", display_order: 610 },
  { name: "Sales and Marketing", code: "090300", description: "PREOPENING COSTS", display_order: 620 },
  { name: "Other Preopening Costs", code: "090900", description: "PREOPENING COSTS", display_order: 630 },

  // FINANCE COSTS
  { name: "Appraisal", code: "100100", description: "FINANCE COSTS", display_order: 640 },
  { name: "Loan Fees", code: "100200", description: "FINANCE COSTS", display_order: 650 },
  { name: "Interest Carry", code: "100300", description: "FINANCE COSTS", display_order: 660 },
  { name: "Site Inspection Fees", code: "100400", description: "FINANCE COSTS", display_order: 670 },
  { name: "TIF/PILOT Fees", code: "100500", description: "FINANCE COSTS", display_order: 680 },
  { name: "Other Finance Costs", code: "100900", description: "FINANCE COSTS", display_order: 690 },

  // SPECIALTY COSTS
  { name: "Art and Placemaking", code: "110100", description: "SPECIALTY COSTS", display_order: 700 },
  { name: "FF&E", code: "110200", description: "SPECIALTY COSTS", display_order: 710 },
  { name: "IT-AV-Security", code: "110300", description: "SPECIALTY COSTS", display_order: 720 },
  { name: "Parking Systems", code: "110400", description: "SPECIALTY COSTS", display_order: 730 },
  { name: "Signage and Wayfinding", code: "110500", description: "SPECIALTY COSTS", display_order: 740 },
  { name: "Other Specialty Costs", code: "110900", description: "SPECIALTY COSTS", display_order: 750 },

  // CONSTRUCTION COSTS
  { name: "Environmental", code: "120100", description: "CONSTRUCTION COSTS", display_order: 760 },
  { name: "Demolition", code: "120200", description: "CONSTRUCTION COSTS", display_order: 770 },
  { name: "Sitework (Land Development)", code: "120300", description: "CONSTRUCTION COSTS", display_order: 780 },
  { name: "CM Fee - Sitework", code: "120301", description: "CONSTRUCTION COSTS", display_order: 790 },
  { name: "Vertical Construction (Core & Shell)", code: "120400", description: "CONSTRUCTION COSTS", display_order: 800 },
  { name: "Vertical Construction (Turn Key)", code: "120500", description: "CONSTRUCTION COSTS", display_order: 810 },
  { name: "105 Keswick Construction", code: "120501", description: "CONSTRUCTION COSTS", display_order: 820 },
  { name: "115 Keswick Construction", code: "120502", description: "CONSTRUCTION COSTS", display_order: 830 },
  { name: "Future Vertical Development", code: "120509", description: "CONSTRUCTION COSTS", display_order: 840 },
  { name: "Future CM Fee - Vertical Construction", code: "120510", description: "CONSTRUCTION COSTS", display_order: 850 },
  { name: "CM Vertical Fee - 105 Keswick", code: "120511", description: "CONSTRUCTION COSTS", display_order: 860 },
  { name: "CM Vertical Fee - 115 Keswick", code: "120512", description: "CONSTRUCTION COSTS", display_order: 870 },
  { name: "Unit Upgrade Allowance", code: "120520", description: "CONSTRUCTION COSTS", display_order: 880 },
  { name: "Other Construction Costs", code: "120900", description: "CONSTRUCTION COSTS", display_order: 890 },

  // TENANT COORDINATION COSTS
  { name: "Tenant Cash Allowance", code: "130100", description: "TENANT COORDINATION COSTS", display_order: 900 },
  { name: "Tenant Improvement (Turn Key)", code: "130200", description: "TENANT COORDINATION COSTS", display_order: 910 },
  { name: "Tenant Coordination AE Costs", code: "130300", description: "TENANT COORDINATION COSTS", display_order: 920 },
  { name: "Other Tenant Coordination Costs", code: "130900", description: "TENANT COORDINATION COSTS", display_order: 930 },

  // CONTINGENCY COSTS
  { name: "Hard Cost Contingency", code: "140100", description: "CONTINGENCY COSTS", display_order: 940 },
  { name: "Soft Cost Contingency", code: "140200", description: "CONTINGENCY COSTS", display_order: 950 },
];
