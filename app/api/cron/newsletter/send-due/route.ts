import { NextRequest, NextResponse } from "next/server";
import { newsletterConfig } from "@/lib/newsletter/config";
import { getDueCampaigns, processCampaign } from "@/lib/newsletter/scheduler";

async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!newsletterConfig.cronSecret || auth !== `Bearer ${newsletterConfig.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await getDueCampaigns();
  const results = [];

  for (const campaign of due) {
    const result = await processCampaign(campaign.id);
    results.push({ campaignId: campaign.id, ...result });
  }

  return NextResponse.json({ processed: results.length, results });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
