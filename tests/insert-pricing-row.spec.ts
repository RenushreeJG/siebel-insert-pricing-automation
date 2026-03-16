import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { readData, writeStatus, RowWithStatus, getDataFilePath, DataSourceType } from '../utils/data-handler';
import { getColumnIndex } from '../utils/grid-handler';
test('Insert Price List From CSV', async ({ page }) => {
    test.setTimeout(0); // Increase timeout to unlimited for complex workflow
    const dataConfig = { dataSource: 'csv' as DataSourceType, baseFilePath: path.resolve(__dirname, '../data/PriceList') };
    const { filePath, format } = getDataFilePath(dataConfig);
    const label = format === 'csv' ? 'CSV' : 'Excel';
    const rows: RowWithStatus[] = await readData(dataConfig);
    console.log(`📖 ${label}: ${filePath} (${rows.length} rows)`);
    const CONFIG = {
        TIMEOUT: {
            LOGIN: 15_000,
            PAGE_LOAD: 10_000,
            NAVIGATION: 5_000,
            ALERT: 500,
            PICKER: 2_000,
            DELAY: 300,
            FIELD: 200,
            SAVE: 1_000,
        },
        SESSION_REFRESH_INTERVAL: 50,
    } as const;

    // Dismisses the VHA system alert modal if visible. Returns the alert message if one was shown.
    async function dismissAlert(page: Page): Promise<string | null> {
        try {
            // Check for VHA modal alert - try multiple selectors
            let modal = page.locator('#VHAOpenModalAlert.VHADisplayBlock');
            let isModalVisible = await modal.isVisible({ timeout: CONFIG.TIMEOUT.ALERT }).catch(() => false);

            // If not found with class, try without class
            if (!isModalVisible) {
                modal = page.locator('#VHAOpenModalAlert');
                isModalVisible = await modal.isVisible({ timeout: CONFIG.TIMEOUT.ALERT }).catch(() => false);
            }

            if (!isModalVisible) {
                // Check for generic System Error dialog
                const systemError = page.locator('text=System Error');
                if (await systemError.isVisible({ timeout: CONFIG.TIMEOUT.ALERT }).catch(() => false)) {
                    console.log('🚨 System Error dialog detected');
                    await page.getByRole('button', { name: 'OK' }).click().catch(() => { });
                    await page.waitForTimeout(CONFIG.TIMEOUT.DELAY);
                    return 'System Error dialog';
                }
                return null;
            }

            const message = (await page.locator('#VHAAlertMessage').textContent().catch(() => 'Alert appeared'))?.trim() ?? '';
            console.log(`🚨 System alert: ${message}`);

            // Try clicking the OK button with multiple strategies
            const okButton = page.locator('.VHAAlertOKBtn, #VHAOpenModalAlert .VHAAlertOKBtn');

            // Strategy 1: Regular click
            const clicked = await okButton.click({ timeout: CONFIG.TIMEOUT.ALERT, force: true }).then(() => true).catch(() => false);

            if (!clicked) {
                // Strategy 2: Dispatch click event
                await okButton.dispatchEvent('click').catch(() => { });
            }

            // Strategy 3: JavaScript click as last resort
            await page.evaluate(() => {
                const btn = document.querySelector('.VHAAlertOKBtn') as HTMLElement;
                if (btn) {
                    btn.click();
                    btn.dispatchEvent(new Event('click', { bubbles: true }));
                }
            }).catch(() => { });

            // Wait for modal to hide
            await page.waitForTimeout(CONFIG.TIMEOUT.DELAY);
            await modal.waitFor({ state: 'hidden', timeout: CONFIG.TIMEOUT.ALERT * 4 }).catch(() => {
                console.log('⚠️  Alert modal did not hide, forcing removal...');
                // Force remove the modal if it's stuck
                page.evaluate(() => {
                    const m = document.querySelector('#VHAOpenModalAlert');
                    if (m) m.remove();
                }).catch(() => { });
            });

            // Additional stabilization delay
            await page.waitForTimeout(CONFIG.TIMEOUT.DELAY);
            return message;
        } catch (e) {
            console.log(`⚠️  Error in dismissAlert: ${e instanceof Error ? e.message : e}`);
            return null;
        }
    }

    // Refresh the session (reload) and handle any resulting alerts. Does not perform navigation.
    async function refreshSession(page: Page): Promise<void> {
        try {
            console.log('🔄 Refreshing session...');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(CONFIG.TIMEOUT.PAGE_LOAD);
            const alertMsg = await dismissAlert(page);
            if (alertMsg) console.log(`🔔 Alert after refresh: ${alertMsg}`);
            console.log('✅ Session refreshed');
        } catch (e) {
            console.log(`⚠️  Session refresh failed: ${e instanceof Error ? e.message : e}`);
        }
    }
    // ===============================
    // LOGIN (Hardcoded for now)
    // ===============================
    await page.goto('https://ek4vlws0371.appc.tpgtelecom.com.au:9001/siebel/app/care/enu');
    await page.getByRole('textbox', { name: 'User ID' }).fill('SBLAUTOUSR');
    await page.getByRole('textbox', { name: 'Password' }).fill('SblDevAutoUsr26');
    await page.getByRole('link', { name: 'Login' }).click();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
    // ===============================
    // NAVIGATION
    // ===============================
    await page.getByRole('navigation', { name: 'Application Menu' })
        .getByRole('link').click();
    // ===============================
    // LOOP THROUGH CSV ROWS
    // ===============================
    let processed = 0;
    for (const row of rows) {
        if (processed > 0 && processed % CONFIG.SESSION_REFRESH_INTERVAL === 0) {
            await refreshSession(page);
        }
        // Clear any leftover alerts at start of iteration (category alerts can persist)
        await dismissAlert(page);
        try {
            await page.getByRole('menuitem', { name: 'Site Map' }).click();
            await page.locator('#s_sma35').click();
            await page.locator('#s_a_35').click();
            await expect(
                page.getByRole('heading', { name: 'Products', level: 2 })
            ).toBeVisible();

            console.log(`\n🔄 Processing Row: ${row.rowNumber} - Product: "${row.data.Product}"`);

            // Ensure we are in Products list view
            await page.getByRole('tab', { name: 'Products' }).click();
            await expect(
                page.getByRole('heading', { name: 'Products', level: 2 })
            ).toBeVisible();
            // SEARCH PRODUCT
            console.log(`🔍 Searching for product: "${row.data.Product}"`);
            await page.getByRole('button', { name: 'Products List Applet:Query' }).click();
            await page.getByRole('textbox', { name: 'Name Link' })
                .fill(row.data.Product);
            await page.keyboard.press('Enter');
            // Dismiss any VHA/System alert that may block results, then allow UI to update
            await dismissAlert(page);
            await page.waitForTimeout(CONFIG.TIMEOUT.DELAY * 4);
            // ===============================
            // SKIP LOGIC: Check if product was found
            // ===============================
            // Wait a moment for search results to load
            await page.waitForTimeout(2000);

            console.log(`🔎 Checking search results for: "${row.data.Product}"`);

            // Check if "No Records" is displayed - this means product was not found
            const noRecordsVisible = await page.locator('text=No Records').first().isVisible().catch(() => false);
            console.log(`   "No Records" visible: ${noRecordsVisible}`);

            if (noRecordsVisible) {
                // Capture page state for debugging
                const safeName = String(row.data.Product).replace(/[^a-z0-9]/gi, '_').slice(0, 50);
                const outPng = path.join('test-results', `row-${row.rowNumber}-${safeName}.png`);
                const outHtml = path.join('test-results', `row-${row.rowNumber}-${safeName}.html`);
                await page.screenshot({ path: outPng, fullPage: true }).catch(() => { });
                const html = await page.content().catch(() => '');
                await fs.promises.writeFile(outHtml, html).catch(() => { });
                console.log(`📎 Saved debug artifacts: ${outPng}, ${outHtml}`);

                // Product not found - skip to next row
                console.log(`❌ Product "${row.data.Product}" not found in Siebel - skipping to next row`);
                row.status = 'Failed';
                row.errorMessage = 'Product not found';
                processed++;
                continue; // Skip to next CSV row
            }
            // Additional check: Verify product name appears in heading, table cells, or page title
            const productFoundInHeading = await page.getByRole('heading', { name: row.data.Product }).isVisible().catch(() => false);
            const productFoundInTable = await page.locator('td').filter({ hasText: row.data.Product }).first().isVisible().catch(() => false);
            const pageTitleContains = (await page.title()).includes(String(row.data.Product));
            const productFound = productFoundInHeading || productFoundInTable || pageTitleContains;

            console.log(`   Found in heading: ${productFoundInHeading}`);
            console.log(`   Found in table cells: ${productFoundInTable}`);
            console.log(`   Found in page title: ${pageTitleContains}`);

            if (!productFound) {
                // Product not found - skip to next row
                console.log(`❌ Product "${row.data.Product}" not found in search results - skipping to next row`);
                row.status = 'Failed';
                row.errorMessage = 'Product not found';
                processed++;
                continue; // Skip to next CSV row
            }
            // PRICING TAB
            await page.getByRole('tab', { name: 'Pricing' }).click();
            await page.getByRole('tab', { name: 'Price Lists' }).click();
            // ================================
            // ADD VODAFONE AU PRICE LIST
            // ================================
            await page.getByRole('button', { name: 'Price Lists:New', exact: true }).click();
            const vodafoneDialog = page.getByRole('dialog', { name: /Pick Price List/i });
            // Select Vodafone AU Price List
            await vodafoneDialog.getByRole('row')
                .filter({ hasText: 'Vodafone AU Price List' })
                .first()
                .click();
            // Click Add
            //await page.getByRole('button', { name: 'Pick Price List:Add' }).click();
            const addButton = page.getByRole('button', { name: 'Pick Price List:Add' });
            const cancelButton = page.getByRole('button', { name: 'Pick Price List:Cancel' });
            // Check if Add button is enabled
            if (await addButton.isEnabled()) {
                // Price list not added yet
                await addButton.click();
            } else {
                // Price list already exists
                await cancelButton.click();
            }
            // Wait for popup to close and handle any alert
            await expect(vodafoneDialog).toBeHidden();
            await dismissAlert(page);
            // Click directly on List Price cell (first editable cell)
            const listPriceCell = page.locator('td[id$="List_Price"]').first();
            await listPriceCell.waitFor();
            await listPriceCell.click();
            // Now input appears
            const listPriceInput = listPriceCell.locator('input[name="List_Price"]');
            await listPriceInput.waitFor();
            await listPriceInput.fill(row.data['Vodafone AU Price List']);
            await listPriceInput.press('Tab');
            await page.keyboard.press('Control+s');
            await page.waitForTimeout(CONFIG.TIMEOUT.SAVE);
            await dismissAlert(page);
            // ================================================
            // ADD VODAFONE AU DATA CLEANSING PRICE LIST
            // ================================================
            await page.getByRole('button', { name: 'Price Lists:New', exact: true }).click();
            const dataDialog = page.getByRole('dialog', { name: /Pick Price List/i });
            // Select Data Cleansing Price List
            await dataDialog.getByRole('row')
                .filter({ hasText: 'Vodafone AU Data Cleansing Price List' })
                .first()
                .click();
            // Click Add
            // Check if Add button is enabled
            if (await addButton.isEnabled()) {
                // Price list not added yet
                await addButton.click();
            } else {
                // Price list already exists
                await cancelButton.click();
            }
            // Wait popup close and handle any alert
            await expect(dataDialog).toBeHidden();
            await dismissAlert(page);
            // Fill List Price for newly added row
            const cleansingCell = page.locator('td[id$="_List_Price"]').last();
            await cleansingCell.waitFor();
            await cleansingCell.click();
            const cleansingInput = cleansingCell.locator('input[name="List_Price"]');
            await cleansingInput.waitFor();
            await cleansingInput.fill(
                row.data['Vodafone AU Data Cleansing Price List']
            );
            await cleansingInput.press('Tab');
            // SAVE
            await page.keyboard.press('Control+s');
            await page.waitForTimeout(CONFIG.TIMEOUT.SAVE);
            await dismissAlert(page);

            // ===============================
            // NAVIGATE TO CATEGORY TAB
            // ===============================

            // Verify product was found
            await expect(page.getByRole('heading', { name: row.data.Product })).toBeVisible();

            // Navigate to Category section using Third Level View Bar dropdown
            await page.evaluate(() => {
                // Try to trigger the Third Level View Bar dropdown to navigate to Category
                const thirdLevelBar = document.querySelector('.siebui-nav-viewlist') as HTMLSelectElement | null;
                if (thirdLevelBar) {
                    // Find the Category option
                    for (let i = 0; i < thirdLevelBar.options.length; i++) {
                        if (thirdLevelBar.options[i].text === 'Category') {
                            // Set the value
                            thirdLevelBar.selectedIndex = i;
                            thirdLevelBar.value = thirdLevelBar.options[i].value;

                            // Trigger events to make Siebel recognize the change
                            const events = ['change', 'click', 'blur'];
                            events.forEach(eventType => {
                                const event = new Event(eventType, { bubbles: true });
                                thirdLevelBar.dispatchEvent(event);
                            });

                            // Also try onchange if it exists
                            if (thirdLevelBar.onchange) {
                                // call onchange with an Event to match expected signature
                                thirdLevelBar.onchange(new Event('change'));
                            }

                            return {
                                success: true,
                                selectedValue: thirdLevelBar.value,
                                selectedText: thirdLevelBar.options[thirdLevelBar.selectedIndex].text
                            };
                        }
                    }
                    return { success: false, reason: 'Category option not found' };
                }
                return { success: false, reason: 'Third Level View Bar not found' };
            });

            // Dismiss any alert that appears when navigating to Category
            await dismissAlert(page);

            // Verify successful navigation to Category Master Data view
            await expect(page.getByRole('main', { name: 'Category Master Data - Products' })).toBeVisible();

            // Alternative verification: Check for Categories heading
            await expect(page.getByRole('heading', { name: 'Categories', level: 2 })).toBeVisible();

            // ===============================
            // ADD CATEGORY TO PRODUCT
            // ===============================

            // Click the New button to add category
            await page.getByRole('button', { name: 'Categories List Applet:New' }).click();

            // Wait for "Add Category" dialog to appear
            const addCategoryDialog = page.getByRole('dialog', { name: 'Add Category' });
            await expect(addCategoryDialog).toBeVisible();

            // Search for the category name from CSV data (using 'Categories' not 'Category')
            await addCategoryDialog.getByLabel('Starting with').fill(row.data.Categories);

            // Click Go to search for the category
            await page.getByRole('button', { name: 'Add Category List Applet:Go' }).click();

            // The matching category should be automatically selected, click OK to add it
            await page.getByRole('button', { name: 'Add Category List Applet:OK' }).click();

            // Handle any alert that might appear and wait for proper processing
            await dismissAlert(page);
            await page.waitForTimeout(1000); // Increased timeout for processing

            // Check if we need to cancel or if dialog auto-closed
            try {
                // If dialog is still visible, click Cancel
                if (await addCategoryDialog.isVisible()) {
                    await page.getByRole('button', { name: 'Add Category List Applet:Cancel' }).click();
                }
            } catch (error) {
                console.log('Dialog may have already closed');
            }

            // Wait for dialog to close with increased timeout
            await expect(addCategoryDialog).toBeHidden({ timeout: 10000 });

            // Wait for the page to be in a stable state before proceeding
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000); // Additional wait for UI to stabilize

            // ==========================================
            // UPDATE MAXIMUM PRICES IN PRICE LISTS
            // ==========================================
            // // Wait for Site Map option to be available
            console.log('Waiting for Site Map menu item...');
            const siteMapMenuItem = page.getByRole('menuitem', { name: 'Site Map' });
            await expect(siteMapMenuItem).toBeVisible({ timeout: 10000 });

            await siteMapMenuItem.click();

            // Click on Administration - Pricing to expand the pricing administration section
            await page.locator('#s_sma34').click();

            // Click on Price Lists to navigate to the price lists administration view
            await page.locator('#s_smc_3406').click();

            // Verify that we are on the Price Lists page
            await expect(page.getByRole('heading', { name: 'Price Lists' })).toBeVisible();

            // ==========================================
            // Update Vodafone AU Price List
            // ==========================================

            // Click search icon to open query interface
            await page.getByRole('button', { name: 'Price Lists:Query' }).click();

            // Search for Vodafone AU Price List
            await page.getByRole('textbox', { name: 'Name Link' }).fill('Vodafone AU Price List');

            // Execute search using specific locator to avoid multiple matches
            await page.locator('#s_1_1_17_0_Ctrl').click();

            // Wait for search results - just wait for page to load and continue
            await page.waitForTimeout(3000);

            // Click on Price List Line Items tab
            await page.getByRole('tab', { name: 'Price List Line Items' }).click();

            // Wait for page to load
            await page.waitForTimeout(2000);

            // Search for the specific product
            await page.getByRole('button', { name: 'Price List Line Items:Query' }).click();
            await page.getByRole('textbox', { name: 'Product Link' }).fill(row.data.Product);

            // Execute search using a more reliable method
            await page.locator('#s_1_1_17_0_Ctrl').click();

            // Wait for product to be found - check if product appears in textbox
            await expect(page.getByRole('textbox', { name: 'Product' }).first()).toHaveValue(row.data.Product);

            // Update Maximum Price if value exists
            if (row.data['Vodafone AU Price List Maximum Price']) {
                await page.getByRole('textbox', { name: 'Maximum Price' }).fill(row.data['Vodafone AU Price List Maximum Price']);

                // Save changes
                await page.keyboard.press('Control+s');

                // Wait for save confirmation
                await page.waitForTimeout(1000);

                console.log(`Updated Vodafone AU Price List - ${row.data.Product}: ${row.data['Vodafone AU Price List Maximum Price']}`);
            }

            // ==========================================
            // Update Vodafone AU Data Cleansing Price List
            // ==========================================

            // Navigate back to Price Lists tab
            await page.getByRole('tab', { name: 'Price Lists' }).click();

            // Click search icon to open query interface
            await page.getByRole('button', { name: 'Price Lists:Query' }).click();

            // Search for Vodafone AU Data Cleansing Price List
            await page.getByRole('textbox', { name: 'Name Link' }).fill('Vodafone AU Data Cleansing Price List');

            // Execute search using specific locator to avoid multiple matches
            await page.locator('#s_1_1_17_0_Ctrl').click();

            // Wait for search results - just wait for page to load and continue
            await page.waitForTimeout(3000);

            // Click on Price List Line Items tab
            await page.getByRole('tab', { name: 'Price List Line Items' }).click();

            // Wait for page to load
            await page.waitForTimeout(2000);

            // Check if product exists or needs to be searched
            const productTextbox = page.getByRole('textbox', { name: 'Product' }).first();
            const currentValue = await productTextbox.inputValue().catch(() => '');
            const productExists = currentValue === row.data.Product;

            if (!productExists) {
                // Search for the specific product
                await page.getByRole('button', { name: 'Price List Line Items:Query' }).click();
                await page.getByRole('textbox', { name: 'Product Link' }).fill(row.data.Product);

                // Execute search using a more reliable method
                await page.locator('#s_1_1_17_0_Ctrl').click();

                // Wait for product to be found - check textbox value
                await expect(page.getByRole('textbox', { name: 'Product' }).first()).toHaveValue(row.data.Product);
            }

            // Update Maximum Price if value exists
            if (row.data['Vodafone AU Data Cleansing Price List Maximum Price']) {
                await page.getByRole('textbox', { name: 'Maximum Price' }).fill(row.data['Vodafone AU Data Cleansing Price List Maximum Price']);

                // Save changes
                await page.keyboard.press('Control+s');

                // Wait for save confirmation
                await page.waitForTimeout(1000);

                console.log(`Updated Vodafone AU Data Cleansing Price List - ${row.data.Product}: ${row.data['Vodafone AU Data Cleansing Price List Maximum Price']}`);
            }

            // Mark row as successful
            row.status = 'Success';
            row.errorMessage = '';
        } catch (error: any) {
            row.status = 'Failed';
            row.errorMessage = error?.message || 'Unknown error';
        }

        processed++;
    }
    await writeStatus(dataConfig, rows);
});