import { Page } from '@playwright/test';
export async function getColumnIndex(
 page: Page,
 columnName: string
): Promise<number> {
 const headers = page.locator('th, div[role="columnheader"]');
 const count = await headers.count();
 for (let i = 0; i < count; i++) {
   const text = (await headers.nth(i).innerText()).trim();
   if (text.includes(columnName)) {
     return i;
   }
 }
 throw new Error(`Column "${columnName}" not found in grid`);
}