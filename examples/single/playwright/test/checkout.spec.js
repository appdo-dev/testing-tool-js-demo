const { test, expect } = require('@playwright/test');
const { qa } = require('@ai-testing-tool/forge-playwright');
const LoginPage = require('./pages/LoginPage');
const InventoryPage = require('./pages/InventoryPage');
const CartPage = require('./pages/CartPage');
const CheckoutPage = require('./pages/CheckoutPage');

test.describe('Checkout Process', () => {
  let loginPage;
  let inventoryPage;
  let cartPage;
  let checkoutPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);
    cartPage = new CartPage(page);
    checkoutPage = new CheckoutPage(page);

    await loginPage.goto();
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/.*inventory\.html/);

    await inventoryPage.addToCart('sauce-labs-backpack');
    await inventoryPage.goToCart();
    await expect(page).toHaveURL(/.*cart\.html/);
    await cartPage.checkout();
    await expect(page).toHaveURL(/.*checkout-step-one\.html/);
  });

  test('User can complete checkout with valid information', async ({ page }) => {
    qa.issueKeys(['AUTH-110']);
    qa.fields({ severity: 'critical', priority: 'low', layer: 'e2e' });
    qa.suite('E-commerce\tCheckout\tComplete Flow');
    qa.parameters({ firstName: 'John', lastName: 'Doe', postalCode: '12345' });

    await test.step('Fill checkout information', async () => {
      await test.step('Enter customer details', async () => {
        await checkoutPage.fillInfo('John', 'Doe', '12345');
      });

      await test.step('Continue to overview', async () => {
        await checkoutPage.continue();
        await expect(page).toHaveURL(/.*checkout-step-two\.html/);
      });
    });

    await test.step('Complete the order', async () => {
      await checkoutPage.finish();
      await expect(page).toHaveURL(/.*checkout-complete\.html/);
    });

    await test.step('Verify order completion', async () => {
      const completeMessage = await checkoutPage.getCompleteMessage();
      expect(completeMessage).toContain('Thank you for your order');
    });
  });

  test('Checkout fails without required information', async ({ page }) => {
    qa.issueKeys(['AUTH-111']);
    qa.fields({ severity: 'normal', priority: 'high', layer: 'e2e' });
    qa.suite('E-commerce\tCheckout\tValidation');
    qa.parameters({ scenario: 'missing_first_name' });

    await test.step('Attempt to continue without filling first name', async () => {
      await checkoutPage.continue();
    });

    await test.step('Verify error message is displayed', async () => {
      const errorMessage = await page.locator(checkoutPage.errorMessage).textContent();
      expect(errorMessage).toContain('Error: First Name is required');
    });
  });

  test('User can cancel checkout', async ({ page }) => {
    qa.issueKeys(['AUTH-112']);
    qa.fields({ severity: 'major', priority: 'medium', layer: 'e2e' });
    qa.suite('E-commerce\tCheckout\tNavigation');

    await test.step('Click cancel button', async () => {
      await checkoutPage.cancel();
    });

    await test.step('Verify return to cart page', async () => {
      await expect(page).toHaveURL(/.*cart\.html/);
      await expect(page.locator(cartPage.pageTitle)).toHaveText('Your Cart');
    });
  });

  test('Demo test that will be ignored in reporting', async () => {
    qa.issueKeys(['AUTH-113']);
    qa.ignore();
    qa.fields({ severity: 'major', priority: 'low', layer: 'e2e' });
    qa.suite('E-commerce\tCheckout\tDemo');
    qa.comment('Intentionally ignored for reporting demos');

    expect(true).toBe(true);
  });
});
