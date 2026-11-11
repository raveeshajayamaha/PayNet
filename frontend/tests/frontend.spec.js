import { test, expect } from "@playwright/test";
const paths = [
  "/",
  "/login",
  "/register",
  "/dashboard",
  "/send-money",
  "/receive-money",
  "/transactions",
  "/notifications",
  "/profile",
  "/admin",
  "/unknown",
];
test("all routes render, local photographs load and no runtime errors occur", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Loading PayNet...");
    if (path === "/") {
      await expect
        .poll(() =>
          page
            .locator(".hero-photo")
            .evaluate((img) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await expect
        .poll(() =>
          page.locator(".lifestyle-photo img").evaluate((img) => {
            img.scrollIntoView();
            return img.complete && img.naturalWidth > 0;
          }),
        )
        .toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
test("mobile routes fit viewport and navigation works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      path,
    ).toBe(true);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Send money", exact: true })
    .click();
  await expect(page).toHaveURL(/send-money/);
  await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
});
test("transfer validates, modal is keyboard friendly and never fabricates success", async ({
  page,
}) => {
  await page.goto("/send-money");
  await page.getByRole("button", { name: "Review transfer" }).click();
  await expect(page.getByText("Enter a valid recipient email.")).toBeVisible();
  await page.getByLabel("Recipient email").fill("friend@example.com");
  await page.getByLabel("Amount (LKR)", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Review transfer" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Review transfer" }).click();
  await page
    .getByRole("button", { name: "Check backend availability" })
    .click();
  await expect(page.getByRole("status")).toContainText("No payment was made.");
});
test("transaction filtering, pagination, details and export", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Page 2 of 4/)).toBeVisible();
  await page.getByLabel("Search transactions").fill("nonexistent");
  await expect(page.getByText("No matching transactions")).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("Transaction type").selectOption("incoming");
  await page.getByLabel("Transaction status").selectOption("completed");
  await page
    .getByRole("button", { name: /View PN-DEMO/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "no real payment occurred",
  );
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export sample CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "paynet-demo-transactions.csv",
  );
});
test("profile edits are session-only and notifications support empty state", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.getByLabel("Full name", { exact: true }).fill("Taylor Demo");
  await page.getByRole("button", { name: "Save demo changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Taylor Demo" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Alex Morgan" }),
  ).toBeVisible();
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.getByRole("button", { name: "Unread (0)" }).click();
  await expect(page.getByText("All caught up.")).toBeVisible();
});
test("auth validates and unavailable backend is explained", async ({
  page,
}) => {
  await page.goto("/register");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Enter your full name.")).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Test Demo");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("DemoPassword123!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("DemoPassword123!");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("backend is connected");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("existing backend health integration", async ({ page, request }) => {
  const response = await request.get("http://localhost:5000/api/health");
  expect(response.ok()).toBe(true);
  expect((await response.json()).success).toBe(true);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status")).toHaveText("PayNet API is running");
});
test("backend failure is actionable and mobile/tablet content stays within screen", async ({
  page,
}) => {
  await page.route("**/api/health", (route) => route.abort());
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status")).toContainText("Backend unavailable");
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/dashboard", "/transactions", "/admin"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${path} at ${width}`,
      ).toBe(true);
    }
  }
});
