import type { KekaEmployee } from "@/lib/integrations/keka/types";

/**
 * Development org fixture — the real people named in the Portal Brief, shaped
 * as Keka would return them (emails synthesised as firstname.lastname). This
 * stands in for the live Keka feed so the sync engine is fully exercised
 * without a Keka key. One person is intentionally in an unmapped department
 * ("Pottery") and one is inactive, to exercise those paths.
 *
 * Emails for the PIO approvers match the seeds in db/009 so a sync arms the
 * approval chain (Khushpreet → Deepak Ji → Hardesh).
 */
export const KEKA_FIXTURE_EMPLOYEES: KekaEmployee[] = [
  // Founders / leadership
  { kekaId: "K001", email: "hardesh.chawla@essentia.in", fullName: "Hardesh Chawla", displayName: "Hardesh", designation: "CEO", departmentName: null, managerKekaId: null, active: true, accessLevelHint: "L0" },
  { kekaId: "K002", email: "monica.chawla@essentia.in", fullName: "Monica Chawla", displayName: "Monica", designation: "Managing Director", departmentName: null, managerKekaId: null, active: true, accessLevelHint: "L0" },
  { kekaId: "K003", email: "deepak.jain@essentia.in", fullName: "Deepak Jain", displayName: "Deepak Ji", designation: "COO / Chief Advisor", departmentName: null, managerKekaId: "K001", active: true, accessLevelHint: "L1" },

  // Production / factory
  { kekaId: "K010", email: "khushpreet.arora@essentia.in", fullName: "Khushpreet Arora", displayName: "Khushpreet", designation: "Production Head", departmentName: "Production", managerKekaId: "K003", active: true, accessLevelHint: "L2" },
  { kekaId: "K011", email: "hitesh.kumar@essentia.in", fullName: "Hitesh Kumar", displayName: "Hitesh", designation: "Carpentry HOD", departmentName: "Production", managerKekaId: "K010", active: true, accessLevelHint: "L2" },
  { kekaId: "K012", email: "shipra.sharma@essentia.in", fullName: "Shipra Sharma", displayName: "Shipra", designation: "PPC Manager", departmentName: "PPC", managerKekaId: "K010", active: true, accessLevelHint: "L2" },
  { kekaId: "K013", email: "aamir.khan@essentia.in", fullName: "Aamir Khan", displayName: "Aamir", designation: "QC Inspector", departmentName: "Quality Control", managerKekaId: "K010", active: true, accessLevelHint: "L3" },

  // CRM
  { kekaId: "K020", email: "dhruv.kelaya@essentia.in", fullName: "Dhruv Kelaya", displayName: "Dhruv", designation: "CRM Team Lead", departmentName: "CRM", managerKekaId: "K003", active: true, accessLevelHint: "L2" },
  { kekaId: "K021", email: "neeru.bajaj@essentia.in", fullName: "Neeru Bajaj", displayName: "Neeru", designation: "CRM Team Lead", departmentName: "CRM", managerKekaId: "K003", active: true, accessLevelHint: "L2" },

  // Design
  { kekaId: "K030", email: "vishakha.arora@essentia.in", fullName: "Vishakha Singh Arora", displayName: "Vishakha", designation: "Head of Interior Design", departmentName: "Interior Design", managerKekaId: "K002", active: true, accessLevelHint: "L2" },
  { kekaId: "K031", email: "yoginder.singh@essentia.in", fullName: "Yoginder Singh", displayName: "Yogi", designation: "Head of Architecture", departmentName: "Architecture", managerKekaId: "K002", active: true, accessLevelHint: "L2" },
  { kekaId: "K032", email: "hriday.singh@essentia.in", fullName: "Hriday Gagan Singh", displayName: "Hriday", designation: "Head of 3D Visualisation", departmentName: "3D Visualisation", managerKekaId: "K002", active: true, accessLevelHint: "L2" },
  { kekaId: "K033", email: "roop.kaur@essentia.in", fullName: "Roop Deep Kaur", displayName: "Roop", designation: "Head of FF&E", departmentName: "FF&E", managerKekaId: "K002", active: true, accessLevelHint: "L2" },
  { kekaId: "K034", email: "jyoti.yadav@essentia.in", fullName: "Jyoti Yadav", displayName: "Jyoti", designation: "WIO/GFC Drafting Lead", departmentName: "WIO GFC Drafting", managerKekaId: "K002", active: true, accessLevelHint: "L2" },

  // Site + procurement + accounts + HR
  { kekaId: "K040", email: "bashruddin@essentia.in", fullName: "Bashruddin", displayName: "Bashruddin", designation: "Onsite Head", departmentName: "Site", managerKekaId: "K003", active: true, accessLevelHint: "L2" },
  { kekaId: "K041", email: "ashish.kumar@essentia.in", fullName: "Ashish Kumar", displayName: "Ashish", designation: "Head of Procurement", departmentName: "Procurement", managerKekaId: "K003", active: true, accessLevelHint: "L2" },
  { kekaId: "K042", email: "rajesh.kumar@essentia.in", fullName: "Rajesh Kumar", displayName: "Rajesh", designation: "Accounts Team Lead", departmentName: "Accounts", managerKekaId: "K003", active: true, accessLevelHint: "L2" },
  { kekaId: "K043", email: "ila.tomar@essentia.in", fullName: "Ila Tomar", displayName: "Ila", designation: "Head of HR", departmentName: "HR", managerKekaId: "K003", active: true, accessLevelHint: "L2" },

  // Edge cases: unmapped department, and an inactive leaver
  { kekaId: "K090", email: "banshi.ram@essentia.in", fullName: "Banshi Ram", displayName: "Banshi", designation: "Pottery Craftsman", departmentName: "Pottery", managerKekaId: "K010", active: true, accessLevelHint: "L3" },
  { kekaId: "K091", email: "former.staff@essentia.in", fullName: "Former Staff", displayName: "Former", designation: "Site Supervisor", departmentName: "Site", managerKekaId: "K040", active: false, accessLevelHint: "L3" },
];
