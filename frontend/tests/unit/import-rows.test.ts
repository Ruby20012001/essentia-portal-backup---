import { describe, expect, it } from "vitest";
// Plain JS shared with the db/ scripts; no types to import.
// @ts-ignore
import { checkProjects, checkVendors, parseCsv, toRecords } from "../../../db/import-rows.mjs";

const csv = (s: string) => toRecords(parseCsv(s));

describe("CSV reading", () => {
  it("handles Excel's BOM, CRLF, quotes and commas inside quotes", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("keeps line numbers for messages and normalises header names", () => {
    const { header, records } = csv("Project Code,Family-Name\nED/1,Sharma\n");
    expect(header).toEqual(["project_code", "family_name"]);
    expect(records[0]).toMatchObject({ line: 2, project_code: "ED/1", family_name: "Sharma" });
  });
});

describe("projects file", () => {
  const head = "project_code,family_name,site_address,current_phase,rag_status,design_fee_total,first_instalment_date\n";

  it("accepts a good row and fills defaults", () => {
    const { problems, rows } = checkProjects(csv(`${head}ED/26-27/041,Sharma,DLF Phase 5,,,1250000,2026-07-01\n`));
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ phase: "discovery", rag: "green", designFee: 1250000, firstInstalment: "2026-07-01" });
  });

  it("reports every problem with its line, and refuses to guess", () => {
    const { problems } = checkProjects(
      csv(
        `${head}ED/1,Sharma,Addr,design,blue,"12,50,000",01/07/2026\nED/1,,,,,,\n`,
      ),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^line 2: current_phase "design"/),
        expect.stringMatching(/^line 2: rag_status "blue"/),
        expect.stringMatching(/^line 2: design_fee_total "12,50,000"/),
        expect.stringMatching(/^line 2: first_instalment_date "01\/07\/2026"/),
        expect.stringMatching(/^line 3: project_code ED\/1 is also on line 2/),
        "line 3: family_name is empty",
        "line 3: site_address is empty",
      ]),
    );
  });

  it("refuses a file missing a required column", () => {
    expect(checkProjects(csv("project_code,family_name\nED/1,Sharma\n")).problems).toEqual([
      'missing the column "site_address"',
    ]);
  });
});

describe("vendors file", () => {
  it("accepts a good row", () => {
    const { problems, rows } = checkVendors(
      csv("vrn_number,company_name,vendor_type,trade_categories,performance_score,is_preferred\nVRN/26-27/042,Raj Enterprises,Contractor,Civil; Masonry,8.4,yes\n"),
    );
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ type: "contractor", trades: ["Civil", "Masonry"], score: 8.4, preferred: true, status: "active" });
  });

  it("refuses PAN, Aadhaar and bank columns outright", () => {
    const { problems } = checkVendors(csv("vrn_number,company_name,pan_number,bank_account\nV1,Raj,X,Y\n"));
    expect(problems[0]).toMatch(/remove the column\(s\) pan_number, bank_account/);
  });

  it("checks score, email and phone", () => {
    const { problems } = checkVendors(
      csv("vrn_number,company_name,performance_score,email,phone\nV1,Raj,11,not-an-email,abc\n"),
    );
    expect(problems).toHaveLength(3);
  });
});
