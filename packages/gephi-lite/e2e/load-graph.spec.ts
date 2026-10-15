import { expect, test } from "@playwright/test";

import { BASE_URL } from "../../../config";

const FILES = ["Java.gexf", "Les Miserables.gexf", "Power Grid.gexf", "airlines.graphml"];

FILES.forEach((file) => {
  test(`Loading '${file}' should work`, async ({ page }) => {
    // Load gephi-lite with the given gexf file
    await page.goto(`/?file=${BASE_URL}/samples/${file}`);

    // Wait for the graph to be fully loaded
    await expect(page).toHaveTitle(`Com'In Explorer`, { timeout: 30000 });

    // Check the screenshot
    await expect(page).not.toHaveURL(/file=/);
    await expect(page.locator("#graph-page canvas").first()).toBeVisible();
  });
});
