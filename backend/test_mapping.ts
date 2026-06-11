import { query, closeDatabasePool } from "./src/config/database.js";

function isTrade(woOtcCode: string): boolean {
  const code = woOtcCode.toUpperCase();
  return code.includes("TRADE") || code.startsWith("01");
}

function isInstallationRow(woOtcCode: string): boolean {
  return woOtcCode.toUpperCase().startsWith("05F");
}

function isPcRow(segment: string, prodLine: string, woOtcCode: string): boolean {
  if (isInstallationRow(woOtcCode)) return false;
  
  const seg = segment.toLowerCase();
  const pl = prodLine.toLowerCase();
  if (seg === "pc") return true;
  if (seg === "print" || seg === "install") return false;
  if (
    pl.includes("notebook") || 
    pl.includes("desktop") || 
    pl.includes("chromebook") || 
    pl.includes("workstation") || 
    pl.includes("display") || 
    pl.includes("pc") ||
    pl.includes("mws")
  ) {
    return true;
  }
  return false;
}

function isPrintFixRow(segment: string, prodLine: string, woOtcCode: string): boolean {
  if (isInstallationRow(woOtcCode)) return false;
  if (isPcRow(segment, prodLine, woOtcCode)) return false;
  return true;
}

async function main() {
  try {
    const res = await query(`
      SELECT id, segment, product_line_name, wo_otc_code, work_location
      FROM daily_call_plan_report_rows
    `);

    console.log("Total rows in database:", res.rows.length);

    let warrantyCount = 0;
    let tradeCount = 0;
    let classifiedPc = 0;
    let classifiedPrintFix = 0;
    let classifiedInstall = 0;
    let unclassifiedWarranty = 0;

    const regionStats = new Map<string, { warranty: number, pc: number, printFix: number, install: number }>();

    for (const row of res.rows) {
      const seg = row.segment || "";
      const pl = row.product_line_name || "";
      const wo = row.wo_otc_code || "";
      const region = row.work_location || "UNKNOWN";

      if (!regionStats.has(region)) {
        regionStats.set(region, { warranty: 0, pc: 0, printFix: 0, install: 0 });
      }
      const stats = regionStats.get(region)!;

      if (isTrade(wo)) {
        tradeCount++;
      } else {
        warrantyCount++;
        stats.warranty++;
        
        const pc = isPcRow(seg, pl, wo);
        const install = isInstallationRow(wo);
        const printFix = isPrintFixRow(seg, pl, wo);

        if (pc) {
          classifiedPc++;
          stats.pc++;
        }
        if (install) {
          classifiedInstall++;
          stats.install++;
        }
        if (printFix) {
          classifiedPrintFix++;
          stats.printFix++;
        }

        if (!pc && !install && !printFix) {
          unclassifiedWarranty++;
        }
      }
    }

    console.log("Warranty rows count:", warrantyCount);
    console.log("Trade rows count:", tradeCount);
    console.log("Classified PC rows:", classifiedPc);
    console.log("Classified Print Fix rows:", classifiedPrintFix);
    console.log("Classified Install rows:", classifiedInstall);
    console.log("Unclassified Warranty rows:", unclassifiedWarranty);

    console.log("\nREGION BREAKDOWN STATISTICS:");
    for (const [region, stats] of regionStats.entries()) {
      if (stats.warranty > 0) {
        console.log(`Region: ${region} -> Warranty: ${stats.warranty}, PC: ${stats.pc}, PrintFix: ${stats.printFix}, Install: ${stats.install}, Sum(PC+PrintFix+Install): ${stats.pc + stats.printFix + stats.install}`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabasePool();
  }
}

main();
