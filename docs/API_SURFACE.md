# SinaiCamps Business API Surface

Complete mapping of all business-domain API endpoints, frontend functions, backend handlers, database tables, and React Query hooks.

---

## Camps / Projects

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/camps` | GET | `getCamps()` | `GET /api/camps` → `camps.js` | `camps` | `useCampsQuery()` | List all camps/projects for tenant |
| `/camps/:id` | GET | `getCamp(id)` | `GET /api/camps/:id` | `camps` | `useCampQuery(id)` | Get single camp by ID |
| `/camps` | POST | `createCamp(data)` | `POST /api/camps` | `camps` | `useCreateCampMutation()` | Create new camp/project |
| `/camps/:id` | PUT | `updateCamp(id, data)` | `PUT /api/camps/:id` | `camps` | `useUpdateCampMutation()` | Update camp details |
| `/camps/:id` | DELETE | `deleteCamp(id)` | `DELETE /api/camps/:id` | `camps` | `useDeleteCampMutation()` | Delete camp |
| `/camps/:id/products` | GET | `getCampProducts(campId)` | `GET /api/camps/:id/products` | `products`, `product_camps_new` | `useCampProductsQuery(id)` | Get products (room types) for camp |
| `/camps/:id/products` | POST | `addCampProduct(campId, data)` | `POST /api/camps/:id/products` | `product_camps_new` | `useAddCampProductMutation()` | Add product to camp |
| `/camps/:id/products/:productId` | DELETE | `removeCampProduct(campId, productId)` | `DELETE /api/camps/:id/products/:productId` | `product_camps_new` | `useRemoveCampProductMutation()` | Remove product from camp |

## Products (Room Types)

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/products` | GET | `getProducts()` | `GET /api/products` | `products`, `product_lang` | `useProductsQuery()` | List all products (room types) |
| `/products/:id` | GET | `getProduct(id)` | `GET /api/products/:id` | `products`, `product_lang` | `useProductQuery(id)` | Get single product |
| `/products` | POST | `createProduct(data)` | `POST /api/products` | `products`, `product_lang` | `useCreateProductMutation()` | Create new product |
| `/products/:id` | PUT | `updateProduct(id, data)` | `PUT /api/products/:id` | `products`, `product_lang` | `useUpdateProductMutation()` | Update product |
| `/products/:id` | DELETE | `deleteProduct(id)` | `DELETE /api/products/:id` | `products` | `useDeleteProductMutation()` | Delete product |

## Rooms

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/rooms` | GET | `getRooms(campId?)` | `GET /api/rooms` | `rooms_new`, `products` | `useRoomsQuery(campId?)` | List rooms (optionally filtered by camp) |
| `/rooms/:id` | GET | `getRoom(id)` | `GET /api/rooms/:id` | `rooms_new` | `useRoomQuery(id)` | Get single room |
| `/rooms` | POST | `createRoom(data)` | `POST /api/rooms` | `rooms_new` | `useCreateRoomMutation()` | Create new room |
| `/rooms/:id` | PUT | `updateRoom(id, data)` | `PUT /api/rooms/:id` | `rooms_new` | `useUpdateRoomMutation()` | Update room |
| `/rooms/:id` | DELETE | `deleteRoom(id)` | `DELETE /api/rooms/:id` | `rooms_new` | `useDeleteRoomMutation()` | Delete room |
| `/rooms/:id/status` | PATCH | `updateRoomStatus(id, status)` | `PATCH /api/rooms/:id/status` | `rooms_new` | `useUpdateRoomStatusMutation()` | Update room cleaning/status |
| `/rooms/availability` | GET | `checkRoomAvailability(params)` | `GET /api/rooms/availability` | `rooms_new`, `orders` | `useRoomAvailabilityQuery(params)` | Check room availability for dates |

## Rate Plans

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/rate-plans` | GET | `getRatePlans(productId?)` | `GET /api/rate-plans` | `rate_plans_new` | `useRatePlansQuery(productId?)` | List rate plans (optionally by product) |
| `/rate-plans/:id` | GET | `getRatePlan(id)` | `GET /api/rate-plans/:id` | `rate_plans_new` | `useRatePlanQuery(id)` | Get single rate plan |
| `/rate-plans` | POST | `createRatePlan(data)` | `POST /api/rate-plans` | `rate_plans_new` | `useCreateRatePlanMutation()` | Create new rate plan |
| `/rate-plans/:id` | PUT | `updateRatePlan(id, data)` | `PUT /api/rate-plans/:id` | `rate_plans_new` | `useUpdateRatePlanMutation()` | Update rate plan |
| `/rate-plans/:id` | DELETE | `deleteRatePlan(id)` | `DELETE /api/rate-plans/:id` | `rate_plans_new` | `useDeleteRatePlanMutation()` | Delete rate plan |

## Orders / Reservations

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/orders` | GET | `getOrders(params?)` | `GET /api/orders` | `orders`, `rooms_new`, `customers`, `order_state` | `useOrdersQuery(params?)` | List all orders/reservations |
| `/orders/:id` | GET | `getOrder(id)` | `GET /api/orders/:id` | `orders`, `rooms_new`, `customers`, `order_state` | `useOrderQuery(id)` | Get single order |
| `/orders` | POST | `createOrder(data)` | `POST /api/orders` | `orders`, `customers` | `useCreateOrderMutation()` | Create new reservation |
| `/orders/:id` | PUT | `updateOrder(id, data)` | `PUT /api/orders/:id` | `orders` | `useUpdateOrderMutation()` | Update order details |
| `/orders/:id` | DELETE | `deleteOrder(id)` | `DELETE /api/orders/:id` | `orders` | `useDeleteOrderMutation()` | Delete order |
| `/orders/:id/status` | PATCH | `updateOrderStatus(id, status)` | `PATCH /api/orders/:id/status` | `orders`, `order_state` | `useUpdateOrderStatusMutation()` | Change order status |
| `/orders/:id/payment` | PATCH | `updateOrderPayment(id, data)` | `PATCH /api/orders/:id/payment` | `orders` | `useUpdateOrderPaymentMutation()` | Record payment against order |
| `/orders/:id/line-items` | GET | `getOrderLineItems(orderId)` | `GET /api/orders/:id/line-items` | `order_items` | `useOrderLineItemsQuery(id)` | Get line items for order |
| `/orders/:id/line-items` | POST | `addOrderLineItem(orderId, data)` | `POST /api/orders/:id/line-items` | `order_items` | `useAddOrderLineItemMutation()` | Add line item to order |
| `/orders/:id/line-items/:itemId` | DELETE | `removeOrderLineItem(orderId, itemId)` | `DELETE /api/orders/:id/line-items/:itemId` | `order_items` | `useRemoveOrderLineItemMutation()` | Remove line item from order |
| `/orders/:id/meal-plan` | GET | `getOrderMealPlan(orderId)` | `GET /api/orders/:id/meal-plan` | `order_meal_plans` | `useOrderMealPlanQuery(id)` | Get meal plan for order |
| `/orders/:id/meal-plan` | POST | `setOrderMealPlan(orderId, data)` | `POST /api/orders/:id/meal-plan` | `order_meal_plans` | `useSetOrderMealPlanMutation()` | Set/update meal plan for order |
| `/orders/availability` | GET | `checkAvailability(params)` | `GET /api/orders/availability` | `orders`, `rooms_new` | `useAvailabilityQuery(params)` | Check availability across rooms |

## Customers

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/customers` | GET | `getCustomers()` | `GET /api/customers` | `customers` | `useCustomersQuery()` | List all customers |
| `/customers/:id` | GET | `getCustomer(id)` | `GET /api/customers/:id` | `customers` | `useCustomerQuery(id)` | Get single customer |
| `/customers` | POST | `createCustomer(data)` | `POST /api/customers` | `customers` | `useCreateCustomerMutation()` | Create new customer |

## Meals

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/meals` | GET | `getMeals()` | `GET /api/meals` | `meals`, `meal_lang`, `meal_categories` | `useMealsQuery()` | List all meals |
| `/meals/:id` | GET | `getMeal(id)` | `GET /api/meals/:id` | `meals`, `meal_lang` | `useMealQuery(id)` | Get single meal |
| `/meals` | POST | `createMeal(data)` | `POST /api/meals` | `meals`, `meal_lang` | `useCreateMealMutation()` | Create new meal |
| `/meals/:id` | PUT | `updateMeal(id, data)` | `PUT /api/meals/:id` | `meals`, `meal_lang` | `useUpdateMealMutation()` | Update meal |
| `/meals/:id` | DELETE | `deleteMeal(id)` | `DELETE /api/meals/:id` | `meals` | `useDeleteMealMutation()` | Delete meal |
| `/meal-categories` | GET | `getMealCategories()` | `GET /api/meal-categories` | `meal_categories`, `meal_categories_lang` | `useMealCategoriesQuery()` | List meal categories |
| `/meal-categories/:id` | GET | `getMealCategory(id)` | `GET /api/meal-categories/:id` | `meal_categories`, `meal_categories_lang` | `useMealCategoryQuery(id)` | Get single meal category |
| `/meal-categories` | POST | `createMealCategory(data)` | `POST /api/meal-categories` | `meal_categories`, `meal_categories_lang` | `useCreateMealCategoryMutation()` | Create meal category |
| `/meal-categories/:id` | PUT | `updateMealCategory(id, data)` | `PUT /api/meal-categories/:id` | `meal_categories`, `meal_categories_lang` | `useUpdateMealCategoryMutation()` | Update meal category |
| `/meal-categories/:id` | DELETE | `deleteMealCategory(id)` | `DELETE /api/meal-categories/:id` | `meal_categories` | `useDeleteMealCategoryMutation()` | Delete meal category |

## Meal Schedules

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/meal-schedules` | GET | `getMealSchedules(params?)` | `GET /api/meal-schedules` | `meal_schedules`, `meals`, `camps` | `useMealSchedulesQuery(params?)` | List meal schedules |
| `/meal-schedules/:id` | GET | `getMealSchedule(id)` | `GET /api/meal-schedules/:id` | `meal_schedules` | `useMealScheduleQuery(id)` | Get single meal schedule |
| `/meal-schedules` | POST | `createMealSchedule(data)` | `POST /api/meal-schedules` | `meal_schedules` | `useCreateMealScheduleMutation()` | Create meal schedule |
| `/meal-schedules/:id` | PUT | `updateMealSchedule(id, data)` | `PUT /api/meal-schedules/:id` | `meal_schedules` | `useUpdateMealScheduleMutation()` | Update meal schedule |
| `/meal-schedules/:id` | DELETE | `deleteMealSchedule(id)` | `DELETE /api/meal-schedules/:id` | `meal_schedules` | `useDeleteMealScheduleMutation()` | Delete meal schedule |

## Promotions

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/promotions` | GET | `getPromotions()` | `GET /api/promotions` | `promotions` | `usePromotionsQuery()` | List all promotions |
| `/promotions/:id` | GET | `getPromotion(id)` | `GET /api/promotions/:id` | `promotions` | `usePromotionQuery(id)` | Get single promotion |
| `/promotions` | POST | `createPromotion(data)` | `POST /api/promotions` | `promotions` | `useCreatePromotionMutation()` | Create new promotion |
| `/promotions/:id` | PUT | `updatePromotion(id, data)` | `PUT /api/promotions/:id` | `promotions` | `useUpdatePromotionMutation()` | Update promotion |
| `/promotions/:id` | DELETE | `deletePromotion(id)` | `DELETE /api/promotions/:id` | `promotions` | `useDeletePromotionMutation()` | Delete promotion |
| `/promotions/apply` | POST | `applyPromotion(data)` | `POST /api/promotions/apply` | `promotions` | — | Apply promotion to cart (discount engine) |

## Services

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/services/definitions` | GET | `getServiceDefinitions()` | `GET /api/services/definitions` | `service_definitions` | `useServiceDefinitionsQuery()` | List service definitions |
| `/services/definitions/:id` | GET | `getServiceDefinition(id)` | `GET /api/services/definitions/:id` | `service_definitions` | `useServiceDefinitionQuery(id)` | Get single definition |
| `/services/definitions` | POST | `createServiceDefinition(data)` | `POST /api/services/definitions` | `service_definitions` | `useCreateServiceDefinitionMutation()` | Create service definition |
| `/services/definitions/:id` | PUT | `updateServiceDefinition(id, data)` | `PUT /api/services/definitions/:id` | `service_definitions` | `useUpdateServiceDefinitionMutation()` | Update definition |
| `/services/definitions/:id` | DELETE | `deleteServiceDefinition(id)` | `DELETE /api/services/definitions/:id` | `service_definitions` | `useDeleteServiceDefinitionMutation()` | Delete definition |
| `/services/items` | GET | `getServiceItems(defId?)` | `GET /api/services/items` | `service_items` | `useServiceItemsQuery(defId?)` | List service items |
| `/services/items/:id` | GET | `getServiceItem(id)` | `GET /api/services/items/:id` | `service_items` | `useServiceItemQuery(id)` | Get single item |
| `/services/items` | POST | `createServiceItem(data)` | `POST /api/services/items` | `service_items` | `useCreateServiceItemMutation()` | Create service item |
| `/services/items/:id` | PUT | `updateServiceItem(id, data)` | `PUT /api/services/items/:id` | `service_items` | `useUpdateServiceItemMutation()` | Update item |
| `/services/items/:id` | DELETE | `deleteServiceItem(id)` | `DELETE /api/services/items/:id` | `service_items` | `useDeleteServiceItemMutation()` | Delete item |
| `/services/items/:id/pricing` | PUT | `updateServicePricing(id, data)` | `PUT /api/services/items/:id/pricing` | `service_items` | — | Update pricing tier |
| `/services/items/:id/availability` | GET | `getServiceAvailability(itemId)` | `GET /api/services/items/:id/availability` | `service_availability` | — | Get availability slots |
| `/services/items/:id/availability` | POST | `createServiceAvailabilitySlot(itemId, data)` | `POST /api/services/items/:id/availability` | `service_availability` | — | Create availability slot |
| `/services/bookings` | GET | `getServiceBookings(itemId?)` | `GET /api/services/bookings` | `service_bookings` | `useServiceBookingsQuery(itemId?)` | List bookings |
| `/services/bookings/:id` | GET | `getServiceBooking(id)` | `GET /api/services/bookings/:id` | `service_bookings` | `useServiceBookingQuery(id)` | Get single booking |
| `/services/bookings` | POST | `createServiceBooking(data)` | `POST /api/services/bookings` | `service_bookings` | `useCreateServiceBookingMutation()` | Create booking |
| `/services/bookings/:id/status` | PATCH | `updateServiceBookingStatus(id, status)` | `PATCH /api/services/bookings/:id/status` | `service_bookings` | `useUpdateServiceBookingStatusMutation()` | Update booking status |
| `/services/bookings/:id/assign` | PATCH | `assignServiceBooking(id, workerId)` | `PATCH /api/services/bookings/:id/assign` | `service_bookings` | — | Assign worker to booking |
| `/services/reviews` | GET | `getServiceReviews()` | `GET /api/services/reviews` | `service_reviews` | — | List service reviews |
| `/services/reviews` | POST | `submitServiceReview(data)` | `POST /api/services/reviews` | `service_reviews` | — | Submit a review |
| `/services/public/:slug` | GET | `getPublicServices(slug)` | `GET /api/services/public/:slug` | `service_definitions`, `service_items` | — | Public catalog by tenant slug |

## Inbox

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/inbox` | GET | `getInbox(params?)` | `GET /api/inbox` | `leads`, `orders`, `inbox_reads`, `inbox` | `useInboxQuery(params?)` | Unified leads + bookings feed |
| `/inbox/:type/:id/read` | PATCH | `markInboxRead(type, id)` | `PATCH /api/inbox/:type/:id/read` | `leads`, `inbox_reads` | `useMarkInboxReadMutation()` | Mark item as read |
| `/inbox/:type/:id` | DELETE | `deleteInboxItem(type, id)` | `DELETE /api/inbox/:type/:id` | `leads`, `inbox` | `useDeleteInboxItemMutation()` | Delete inbox item |

## Tags

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/tags` | GET | `getTags()` | `GET /api/tags` | `tags` | `useTagsQuery()` | List all tags |
| `/tags/:id` | GET | `getTag(id)` | `GET /api/tags/:id` | `tags` | `useTagQuery(id)` | Get single tag |
| `/tags` | POST | `createTag(data)` | `POST /api/tags` | `tags` | `useCreateTagMutation()` | Create new tag |
| `/tags/:id` | PUT | `updateTag(id, data)` | `PUT /api/tags/:id` | `tags` | `useUpdateTagMutation()` | Update tag |
| `/tags/:id` | DELETE | `deleteTag(id)` | `DELETE /api/tags/:id` | `tags` | `useDeleteTagMutation()` | Delete tag |
| `/tags/project/:projectId` | GET | `getProjectTags(projectId)` | `GET /api/tags/project/:projectId` | `project_tags`, `tags` | `useProjectTagsQuery(id)` | Get tags for project |
| `/tags/project/:projectId` | PUT | `setProjectTags(projectId, tagIds)` | `PUT /api/tags/project/:projectId` | `project_tags` | `useSetProjectTagsMutation()` | Set tags on project |

## Meta (EAV Custom Fields)

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/meta/tenant/:tenantId` | GET | `getTenantMeta(tenantId)` | `GET /api/meta/tenant/:tenantId` | `tenant_meta` | `useTenantMetaQuery(id)` | Get custom fields for tenant |
| `/meta/tenant/:tenantId` | PUT | `setTenantMeta(tenantId, data)` | `PUT /api/meta/tenant/:tenantId` | `tenant_meta` | `useSetTenantMetaMutation()` | Set custom fields for tenant |
| `/meta/project/:projectId` | GET | `getProjectMeta(projectId)` | `GET /api/meta/project/:projectId` | `project_meta` | `useProjectMetaQuery(id)` | Get custom fields for project |
| `/meta/project/:projectId` | PUT | `setProjectMeta(projectId, data)` | `PUT /api/meta/project/:projectId` | `project_meta` | `useSetProjectMetaMutation()` | Set custom fields for project |

## Categories

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/categories` | GET | `getCategories()` | `GET /api/categories` | `categories`, `category_lang` | `useCategoriesQuery()` | List product categories |
| `/categories/:id` | GET | `getCategory(id)` | `GET /api/categories/:id` | `categories`, `category_lang` | `useCategoryQuery(id)` | Get single category |
| `/categories` | POST | `createCategory(data)` | `POST /api/categories` | `categories`, `category_lang` | `useCreateCategoryMutation()` | Create category |
| `/categories/:id` | PUT | `updateCategory(id, data)` | `PUT /api/categories/:id` | `categories`, `category_lang` | `useUpdateCategoryMutation()` | Update category |
| `/categories/:id` | DELETE | `deleteCategory(id)` | `DELETE /api/categories/:id` | `categories` | `useDeleteCategoryMutation()` | Delete category |

## Reports

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/reports/occupancy` | GET | `getOccupancyReport(params?)` | `GET /api/reports/occupancy` | `orders`, `rooms_new` | `useOccupancyReportQuery(params?)` | Occupancy analytics |
| `/reports/revenue` | GET | `getRevenueReport(params?)` | `GET /api/reports/revenue` | `orders`, `pos_transactions` | `useRevenueReportQuery(params?)` | Revenue analytics |
| `/reports/meal-plan` | GET | `getMealPlanReport(params?)` | `GET /api/reports/meal-plan` | `order_meal_plans`, `meals` | `useMealPlanReportQuery(params?)` | Meal plan analytics |
| `/reports/revenue-breakdown` | GET | `getRevenueBreakdown(days?)` | `GET /api/reports/revenue-breakdown` | `orders`, `pos_transactions` | — | Revenue breakdown by type/payment |
| `/reports/customer-metrics` | GET | `getCustomerMetrics(days?)` | `GET /api/reports/customer-metrics` | `customers`, `orders` | — | Customer analytics |
| `/reports/seasonal` | GET | `getSeasonalComparison()` | `GET /api/reports/seasonal` | `orders`, `pos_transactions` | — | Seasonal comparison |

## Inventory Adjustments

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/inventory/adjustments` | GET | `getInventoryAdjustments()` | `GET /api/inventory/adjustments` | `inventory_adjustments` | `useInventoryAdjustmentsQuery()` | List adjustments |
| `/inventory/adjustments` | POST | `createInventoryAdjustment(data)` | `POST /api/inventory/adjustments` | `inventory_adjustments`, `pos_products` | `useCreateInventoryAdjustmentMutation()` | Create adjustment |
| `/inventory/reorder-suggestions` | GET | `getReorderSuggestions()` | `GET /api/inventory/reorder-suggestions` | `pos_products` | `useReorderSuggestionsQuery()` | Get reorder suggestions |

## Low Stock Alerts

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/low-stock` | GET | `getLowStockAlerts()` | `GET /api/low-stock` | `pos_products`, `inbox` | `useLowStockAlertsQuery()` | List low stock alerts |
| `/low-stock/:id/read` | PATCH | `markLowStockRead(id)` | `PATCH /api/low-stock/:id/read` | `inbox` | `useMarkLowStockReadMutation()` | Mark alert as read |

## Marketplace

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/marketplace/projects` | GET | `getMarketplaceProjects(params?)` | `GET /api/marketplace/projects` | `camps`, `tenants`, `project_meta` | `useMarketplaceProjectsQuery(params?)` | Public project listing |
| `/marketplace/categories` | GET | `getMarketplaceCategories()` | `GET /api/marketplace/categories` | `marketplace_categories` | `useMarketplaceCategoriesQuery()` | List marketplace categories |
| `/marketplace/:slug` | GET | `getMarketplaceTenantProfile(slug)` | `GET /api/marketplace/:slug` | `tenants`, `tenant_meta`, `camps` | `useMarketplaceTenantProfileQuery(slug)` | Public tenant profile |
| `/marketplace/reviews` | POST | `submitMarketplaceReview(data)` | `POST /api/marketplace/reviews` | `marketplace_reviews` | `useSubmitMarketplaceReviewMutation()` | Submit public review |
| `/marketplace/reviews/:projectId` | GET | `getMarketplaceReviews(projectId)` | `GET /api/marketplace/reviews/:projectId` | `marketplace_reviews` | `useMarketplaceReviewsQuery(id)` | Get reviews for project |

## Planning

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/plans` | GET | `getPlans(campId?)` | `GET /api/plans` | `plans_new` | `usePlansQuery(campId?)` | List activity/event plans |
| `/plans/:id` | GET | `getPlan(id)` | `GET /api/plans/:id` | `plans_new` | `usePlanQuery(id)` | Get single plan |
| `/plans` | POST | `createPlan(data)` | `POST /api/plans` | `plans_new` | `useCreatePlanMutation()` | Create new plan |
| `/plans/:id` | PUT | `updatePlan(id, data)` | `PUT /api/plans/:id` | `plans_new` | `useUpdatePlanMutation()` | Update plan |
| `/plans/:id` | DELETE | `deletePlan(id)` | `DELETE /api/plans/:id` | `plans_new` | `useDeletePlanMutation()` | Delete plan |

## Financial Management

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/financials/accounts` | GET | `getFinancialAccounts()` | `GET /api/financials/accounts` | `accounts` | `useFinancialAccountsQuery()` | List chart of accounts |
| `/financials/accounts` | POST | `createFinancialAccount(data)` | `POST /api/financials/accounts` | `accounts` | `useCreateFinancialAccountMutation()` | Create account |
| `/financials/accounts/:id` | PUT | `updateFinancialAccount(id, data)` | `PUT /api/financials/accounts/:id` | `accounts` | `useUpdateFinancialAccountMutation()` | Update account |
| `/financials/accounts/:id` | DELETE | `deleteFinancialAccount(id)` | `DELETE /api/financials/accounts/:id` | `accounts` | `useDeleteFinancialAccountMutation()` | Delete account |
| `/financials/journals` | GET | `getFinancialJournals()` | `GET /api/financials/journals` | `journals` | `useFinancialJournalsQuery()` | List journals |
| `/financials/journals` | POST | `createFinancialJournal(data)` | `POST /api/financials/journals` | `journals` | `useCreateFinancialJournalMutation()` | Create journal |
| `/financials/journal-entries` | GET | `getJournalEntries(params?)` | `GET /api/financials/journal-entries` | `journal_entries`, `entry_lines` | `useJournalEntriesQuery(params?)` | List journal entries |
| `/financials/journal-entries` | POST | `createJournalEntry(data)` | `POST /api/financials/journal-entries` | `journal_entries`, `entry_lines` | `useCreateJournalEntryMutation()` | Create journal entry |
| `/financials/journal-entries/:id/post` | POST | `postJournalEntry(id)` | `POST /api/financials/journal-entries/:id/post` | `journal_entries` | `usePostJournalEntryMutation()` | Post journal entry |
| `/financials/invoices` | GET | `getFinancialInvoices(params?)` | `GET /api/financials/invoices` | `invoices` | `useFinancialInvoicesQuery(params?)` | List invoices |
| `/financials/invoices` | POST | `createFinancialInvoice(data)` | `POST /api/financials/invoices` | `invoices`, `invoice_lines` | `useCreateFinancialInvoiceMutation()` | Create invoice |
| `/financials/invoices/:id/status` | PATCH | `updateInvoiceStatus(id, status)` | `PATCH /api/financials/invoices/:id/status` | `invoices` | `useUpdateInvoiceStatusMutation()` | Update invoice status |
| `/financials/payments` | POST | `createPayment(data)` | `POST /api/financials/payments` | `payments` | `useCreatePaymentMutation()` | Record payment |
| `/financials/tax-rates` | GET | `getTaxRates()` | `GET /api/financials/tax-rates` | `tax_rates` | `useTaxRatesQuery()` | List tax rates |
| `/financials/tax-rates` | POST | `createTaxRate(data)` | `POST /api/financials/tax-rates` | `tax_rates` | `useCreateTaxRateMutation()` | Create tax rate |
| `/financials/process-payment` | POST | `processPayment(data)` | `POST /api/financials/process-payment` | `payments` | — | Process payment (stub) |
| `/financials/confirm-payment` | POST | `confirmFinancialPayment(paymentId)` | `POST /api/financials/confirm-payment` | `payments` | — | Confirm payment (stub) |

## HR & Payroll

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/hr/employees` | GET | `getHrEmployees()` | `GET /api/hr/employees` | `employees` | `useHrEmployeesQuery()` | List employees |
| `/hr/employees` | POST | `createHrEmployee(data)` | `POST /api/hr/employees` | `employees` | `useCreateHrEmployeeMutation()` | Create employee |
| `/hr/employees/:id` | PUT | `updateHrEmployee(id, data)` | `PUT /api/hr/employees/:id` | `employees` | `useUpdateHrEmployeeMutation()` | Update employee |
| `/hr/employees/:id` | DELETE | `deleteHrEmployee(id)` | `DELETE /api/hr/employees/:id` | `employees` | `useDeleteHrEmployeeMutation()` | Delete employee |
| `/hr/leave-types` | GET | `getHrLeaveTypes()` | `GET /api/hr/leave-types` | `leave_types` | `useHrLeaveTypesQuery()` | List leave types |
| `/hr/leave-types` | POST | `createHrLeaveType(data)` | `POST /api/hr/leave-types` | `leave_types` | `useCreateHrLeaveTypeMutation()` | Create leave type |
| `/hr/leave-requests` | GET | `getHrLeaveRequests()` | `GET /api/hr/leave-requests` | `leave_requests` | `useHrLeaveRequestsQuery()` | List leave requests |
| `/hr/leave-requests` | POST | `createHrLeaveRequest(data)` | `POST /api/hr/leave-requests` | `leave_requests` | `useCreateHrLeaveRequestMutation()` | Create leave request |
| `/hr/leave-requests/:id/approve` | PATCH | `approveHrLeaveRequest(id, status)` | `PATCH /api/hr/leave-requests/:id/approve` | `leave_requests` | `useApproveHrLeaveRequestMutation()` | Approve/reject leave |
| `/hr/payroll/runs` | GET | `getHrPayrollRuns()` | `GET /api/hr/payroll/runs` | `payroll_runs`, `payroll_lines` | `useHrPayrollRunsQuery()` | List payroll runs |
| `/hr/payroll/runs` | POST | `createHrPayrollRun(data)` | `POST /api/hr/payroll/runs` | `payroll_runs` | `useCreateHrPayrollRunMutation()` | Create payroll run |
| `/hr/payroll/runs/:id/post` | POST | `postHrPayrollRun(id)` | `POST /api/hr/payroll/runs/:id/post` | `payroll_runs` | `usePostHrPayrollRunMutation()` | Post payroll run |
| `/hr/job-posts` | GET | `getHrJobPosts()` | `GET /api/hr/job-posts` | `job_posts` | `useHrJobPostsQuery()` | List job posts |
| `/hr/job-posts` | POST | `createHrJobPost(data)` | `POST /api/hr/job-posts` | `job_posts` | `useCreateHrJobPostMutation()` | Create job post |
| `/hr/applicants` | POST | `createHrApplicant(data)` | `POST /api/hr/applicants` | `applicants` | — | Create applicant |

## Supply Chain

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/supply/warehouses` | GET | `getSupplyWarehouses()` | `GET /api/supply/warehouses` | `warehouses` | `useSupplyWarehousesQuery()` | List warehouses |
| `/supply/warehouses` | POST | `createSupplyWarehouse(data)` | `POST /api/supply/warehouses` | `warehouses` | `useCreateSupplyWarehouseMutation()` | Create warehouse |
| `/supply/stock` | GET | `getSupplyStock(params?)` | `GET /api/supply/stock` | `stock_quant` | `useSupplyStockQuery(params?)` | List stock levels |
| `/supply/stock` | POST | `adjustSupplyStock(data)` | `POST /api/supply/stock` | `stock_quant` | `useAdjustSupplyStockMutation()` | Adjust stock |
| `/supply/stock-transfers` | GET | `getSupplyTransfers()` | `GET /api/supply/stock-transfers` | `stock_transfers` | `useSupplyTransfersQuery()` | List transfers |
| `/supply/stock-transfers` | POST | `createSupplyTransfer(data)` | `POST /api/supply/stock-transfers` | `stock_transfers` | `useCreateSupplyTransferMutation()` | Create transfer |
| `/supply/stock-transfers/:id/confirm` | PATCH | `confirmSupplyTransfer(id)` | `PATCH /api/supply/stock-transfers/:id/confirm` | `stock_transfers` | `useConfirmSupplyTransferMutation()` | Confirm transfer |
| `/supply/purchase-orders` | GET | `getSupplyPurchaseOrders()` | `GET /api/supply/purchase-orders` | `purchase_orders`, `purchase_order_lines` | `useSupplyPurchaseOrdersQuery()` | List POs |
| `/supply/purchase-orders` | POST | `createSupplyPurchaseOrder(data)` | `POST /api/supply/purchase-orders` | `purchase_orders`, `purchase_order_lines` | `useCreateSupplyPurchaseOrderMutation()` | Create PO |
| `/supply/purchase-orders/:id/receive` | PATCH | `receiveSupplyPurchaseOrder(id)` | `PATCH /api/supply/purchase-orders/:id/receive` | `purchase_orders` | `useReceiveSupplyPurchaseOrderMutation()` | Receive PO |
| `/supply/boms` | GET | `getSupplyBoms()` | `GET /api/supply/boms` | `boms`, `bom_lines` | `useSupplyBomsQuery()` | List BOMs |
| `/supply/boms` | POST | `createSupplyBom(data)` | `POST /api/supply/boms` | `boms`, `bom_lines` | `useCreateSupplyBomMutation()` | Create BOM |
| `/supply/manufacturing-orders` | GET | `getSupplyManufacturingOrders()` | `GET /api/supply/manufacturing-orders` | `manufacturing_orders` | `useSupplyManufacturingOrdersQuery()` | List MOs |
| `/supply/manufacturing-orders` | POST | `createSupplyManufacturingOrder(data)` | `POST /api/supply/manufacturing-orders` | `manufacturing_orders` | `useCreateSupplyManufacturingOrderMutation()` | Create MO |
| `/supply/manufacturing-orders/:id/progress` | PATCH | `progressSupplyManufacturingOrder(id, qty)` | `PATCH /api/supply/manufacturing-orders/:id/progress` | `manufacturing_orders` | `useProgressSupplyManufacturingOrderMutation()` | Update MO progress |

## CRM

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/crm/contacts` | GET | `getCrmContacts(params?)` | `GET /api/crm/contacts` | `crm_contacts` | `useCrmContactsQuery(params?)` | List contacts |
| `/crm/contacts` | POST | `createCrmContact(data)` | `POST /api/crm/contacts` | `crm_contacts` | `useCreateCrmContactMutation()` | Create contact |
| `/crm/contacts/:id` | PUT | `updateCrmContact(id, data)` | `PUT /api/crm/contacts/:id` | `crm_contacts` | `useUpdateCrmContactMutation()` | Update contact |
| `/crm/leads` | GET | `getCrmLeads()` | `GET /api/crm/leads` | `crm_leads` | `useCrmLeadsQuery()` | List leads |
| `/crm/leads` | POST | `createCrmLead(data)` | `POST /api/crm/leads` | `crm_leads` | `useCreateCrmLeadMutation()` | Create lead |
| `/crm/leads/:id/status` | PATCH | `updateCrmLeadStatus(id, status)` | `PATCH /api/crm/leads/:id/status` | `crm_leads` | `useUpdateCrmLeadStatusMutation()` | Update lead status |
| `/crm/opportunities` | GET | `getCrmOpportunities()` | `GET /api/crm/opportunities` | `crm_opportunities` | `useCrmOpportunitiesQuery()` | List opportunities |
| `/crm/opportunities` | POST | `createCrmOpportunity(data)` | `POST /api/crm/opportunities` | `crm_opportunities` | `useCreateCrmOpportunityMutation()` | Create opportunity |
| `/crm/opportunities/:id/stage` | PATCH | `updateCrmOpportunityStage(id, stage)` | `PATCH /api/crm/opportunities/:id/stage` | `crm_opportunities` | `useUpdateCrmOpportunityStageMutation()` | Update opportunity stage |
| `/crm/tasks` | GET | `getCrmTasks(params?)` | `GET /api/crm/tasks` | `crm_tasks` | `useCrmTasksQuery(params?)` | List tasks |
| `/crm/tasks` | POST | `createCrmTask(data)` | `POST /api/crm/tasks` | `crm_tasks` | `useCreateCrmTaskMutation()` | Create task |
| `/crm/tasks/:id/status` | PATCH | `updateCrmTaskStatus(id, status)` | `PATCH /api/crm/tasks/:id/status` | `crm_tasks` | `useUpdateCrmTaskStatusMutation()` | Update task status |
| `/crm/tickets` | GET | `getCrmTickets()` | `GET /api/crm/tickets` | `crm_tickets` | `useCrmTicketsQuery()` | List support tickets |
| `/crm/tickets` | POST | `createCrmTicket(data)` | `POST /api/crm/tickets` | `crm_tickets` | `useCreateCrmTicketMutation()` | Create ticket |
| `/crm/tickets/:id/comments` | POST | `addCrmTicketComment(ticketId, content, internal?)` | `POST /api/crm/tickets/:id/comments` | `crm_ticket_comments` | `useAddCrmTicketCommentMutation()` | Add ticket comment |
| `/crm/knowledge-articles` | GET | `getCrmKnowledgeArticles()` | `GET /api/crm/knowledge-articles` | `crm_knowledge_articles` | `useCrmKnowledgeArticlesQuery()` | List knowledge articles |
| `/crm/knowledge-articles` | POST | `createCrmKnowledgeArticle(data)` | `POST /api/crm/knowledge-articles` | `crm_knowledge_articles` | `useCreateCrmKnowledgeArticleMutation()` | Create article |

## Storefront

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/storefront/products` | GET | `getStorefrontProducts(params?)` | `GET /api/storefront/products` | `pos_products` | `useStorefrontProductsQuery(params?)` | Public product listing |
| `/storefront/products/:id` | GET | `getStorefrontProduct(id)` | `GET /api/storefront/products/:id` | `pos_products` | `useStorefrontProductQuery(id)` | Get single product |
| `/storefront/cart` | GET | `getStorefrontCart(sessionId)` | `GET /api/storefront/cart` | `storefront_cart` | `useStorefrontCartQuery(sessionId)` | Get cart |
| `/storefront/cart/items` | POST | `addToStorefrontCart(data)` | `POST /api/storefront/cart/items` | `storefront_cart_items` | `useAddToStorefrontCartMutation()` | Add to cart |
| `/storefront/cart/items/:id` | PUT | `updateStorefrontCartItem(id, qty)` | `PUT /api/storefront/cart/items/:id` | `storefront_cart_items` | `useUpdateStorefrontCartItemMutation()` | Update cart item |
| `/storefront/cart/items/:id` | DELETE | `removeStorefrontCartItem(id)` | `DELETE /api/storefront/cart/items/:id` | `storefront_cart_items` | `useRemoveStorefrontCartItemMutation()` | Remove cart item |
| `/storefront/checkout` | POST | `checkoutStorefront(data)` | `POST /api/storefront/checkout` | `orders`, `storefront_cart` | `useCheckoutStorefrontMutation()` | Checkout |
| `/storefront/orders` | GET | `getStorefrontOrders(sessionId)` | `GET /api/storefront/orders` | `orders` | `useStorefrontOrdersQuery(sessionId)` | List orders |
| `/storefront/admin/pages` | GET | `getStorefrontPages()` | `GET /api/storefront/admin/pages` | `storefront_pages` | `useStorefrontPagesQuery()` | List CMS pages |
| `/storefront/admin/pages` | POST | `createStorefrontPage(data)` | `POST /api/storefront/admin/pages` | `storefront_pages` | `useCreateStorefrontPageMutation()` | Create page |
| `/storefront/admin/pages/:id` | PUT | `updateStorefrontPage(id, data)` | `PUT /api/storefront/admin/pages/:id` | `storefront_pages` | `useUpdateStorefrontPageMutation()` | Update page |
| `/storefront/admin/pages/:id` | DELETE | `deleteStorefrontPage(id)` | `DELETE /api/storefront/admin/pages/:id` | `storefront_pages` | `useDeleteStorefrontPageMutation()` | Delete page |
| `/storefront/admin/blog` | GET | `getStorefrontBlogPosts()` | `GET /api/storefront/admin/blog` | `storefront_blog_posts` | `useStorefrontBlogPostsQuery()` | List blog posts |
| `/storefront/admin/blog` | POST | `createStorefrontBlogPost(data)` | `POST /api/storefront/admin/blog` | `storefront_blog_posts` | `useCreateStorefrontBlogPostMutation()` | Create blog post |
| `/storefront/admin/blog/:id` | PUT | `updateStorefrontBlogPost(id, data)` | `PUT /api/storefront/admin/blog/:id` | `storefront_blog_posts` | `useUpdateStorefrontBlogPostMutation()` | Update blog post |
| `/storefront/admin/blog/:id` | DELETE | `deleteStorefrontBlogPost(id)` | `DELETE /api/storefront/admin/blog/:id` | `storefront_blog_posts` | `useDeleteStorefrontBlogPostMutation()` | Delete blog post |
| `/storefront/pages` | POST | `saveStorefrontPage(data, editId?)` | `POST/PUT /api/storefront/pages` | `storefront_pages` | — | Save page (generic) |
| `/storefront/blog/posts` | POST | `saveStorefrontBlogPost(data, editId?)` | `POST/PUT /api/storefront/blog/posts` | `storefront_blog_posts` | — | Save blog post (generic) |
| `/storefront/blog/categories` | POST | `saveStorefrontBlogCategory(data, editId?)` | `POST/PUT /api/storefront/blog/categories` | `storefront_blog_categories` | — | Save blog category |
| `/storefront/blog/categories/:id` | DELETE | `deleteStorefrontBlogCategory(id)` | `DELETE /api/storefront/blog/categories/:id` | `storefront_blog_categories` | — | Delete blog category |

## AI & Intelligence

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/ai/predictions` | GET | `getAiPredictions(params?)` | `GET /api/ai/predictions` | `ai_predictions` | `useAiPredictionsQuery(params?)` | List AI predictions |
| `/ai/predictions` | POST | `createAiPrediction(data)` | `POST /api/ai/predictions` | `ai_predictions` | `useCreateAiPredictionMutation()` | Create prediction |
| `/ai/dynamic-price` | POST | `getAiDynamicPrice(data)` | `POST /api/ai/dynamic-price` | — | `useAiDynamicPriceMutation()` | Get dynamic price suggestion |
| `/ai/forecast` | POST | `getAiForecast(data)` | `POST /api/ai/forecast` | — | `useAiForecastMutation()` | Get demand forecast |
| `/ai/anomaly` | POST | `getAiAnomaly(data)` | `POST /api/ai/anomaly` | — | `useAiAnomalyMutation()` | Detect anomalies |
| `/ai/price-rules` | GET | `getAiPriceRules()` | `GET /api/ai/price-rules` | `ai_price_rules` | `useAiPriceRulesQuery()` | List pricing rules |
| `/ai/price-rules` | POST | `createAiPriceRule(data)` | `POST /api/ai/price-rules` | `ai_price_rules` | `useCreateAiPriceRuleMutation()` | Create pricing rule |
| `/ai/price-rules/:id` | PUT | `updateAiPriceRule(id, data)` | `PUT /api/ai/price-rules/:id` | `ai_price_rules` | `useUpdateAiPriceRuleMutation()` | Update pricing rule |
| `/ai/price-rules/:id` | DELETE | `deleteAiPriceRule(id)` | `DELETE /api/ai/price-rules/:id` | `ai_price_rules` | `useDeleteAiPriceRuleMutation()` | Delete pricing rule |
| `/ai/automation-rules` | GET | `getAiAutomationRules()` | `GET /api/ai/automation-rules` | `ai_automation_rules` | `useAiAutomationRulesQuery()` | List automation rules |
| `/ai/automation-rules` | POST | `createAiAutomationRule(data)` | `POST /api/ai/automation-rules` | `ai_automation_rules` | `useCreateAiAutomationRuleMutation()` | Create automation rule |
| `/ai/automation-rules/:id/activate` | PATCH | `toggleAiAutomationRule(id)` | `PATCH /api/ai/automation-rules/:id/activate` | `ai_automation_rules` | `useToggleAiAutomationRuleMutation()` | Toggle rule active/inactive |
| `/ai/automation-rules/:id/toggle` | PUT | `toggleAIAutomationRule(id)` | `PUT /api/ai/automation-rules/:id/toggle` | `ai_automation_rules` | — | Toggle rule (alternate) |
| `/ai/automation-rules/:id` | PUT | `updateAIAutomationRule(id, data)` | `PUT /api/ai/automation-rules/:id` | `ai_automation_rules` | `useUpdateAiAutomationRuleMutation()` | Update automation rule |
| `/ai/automation-logs` | GET | `getAiAutomationLogs()` | `GET /api/ai/automation-logs` | `ai_automation_logs` | `useAiAutomationLogsQuery()` | List automation logs |
| `/ai/workers-ai/analyze` | POST | `analyzeWithWorkersAI(data)` | `POST /api/ai/workers-ai/analyze` | — | — | Workers AI analysis (stub) |
| `/ai/workers-ai/embeddings` | POST | `generateEmbeddings(data)` | `POST /api/ai/workers-ai/embeddings` | — | — | Generate embeddings (stub) |
| `/ai/state/sessions` | GET | `getDurableStateSessions()` | `GET /api/ai/state/sessions` | — | — | Durable Object sessions (stub) |
| `/ai/state/sync` | POST | `syncDurableState(data)` | `POST /api/ai/state/sync` | — | — | Sync DO state (stub) |
| `/ai/state/sync/:key` | GET | `getDurableStateValue(key)` | `GET /api/ai/state/sync/:key` | — | — | Get DO state value (stub) |

## Super Admin (Cross-Tenant)

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/admin/financials/overview` | GET | `getSuperFinancialsOverview()` | `GET /api/admin/financials/overview` | `invoices`, `payments` | `useSuperFinancialsOverviewQuery()` | Cross-tenant financial overview |
| `/admin/financials/invoices` | GET | `getSuperInvoices(page, limit)` | `GET /api/admin/financials/invoices` | `invoices` | `useSuperInvoicesQuery(page, limit)` | All tenant invoices |
| `/admin/hr/overview` | GET | `getSuperHROverview()` | `GET /api/admin/hr/overview` | `employees`, `payroll_runs` | `useSuperHROverviewQuery()` | Cross-tenant HR overview |
| `/admin/hr/employees` | GET | `getSuperEmployees(page, limit)` | `GET /api/admin/hr/employees` | `employees` | `useSuperEmployeesQuery(page, limit)` | All tenant employees |
| `/admin/supply/overview` | GET | `getSuperSupplyOverview()` | `GET /api/admin/supply/overview` | `warehouses`, `stock_quant`, `purchase_orders` | `useSuperSupplyOverviewQuery()` | Cross-tenant supply overview |
| `/admin/supply/purchase-orders` | GET | `getSuperPurchaseOrders(page, limit)` | `GET /api/admin/supply/purchase-orders` | `purchase_orders` | `useSuperPurchaseOrdersQuery(page, limit)` | All tenant POs |
| `/admin/crm/overview` | GET | `getSuperCRMOverview()` | `GET /api/admin/crm/overview` | `crm_contacts`, `crm_leads`, `crm_opportunities`, `crm_tickets` | `useSuperCRMOverviewQuery()` | Cross-tenant CRM overview |
| `/admin/crm/contacts` | GET | `getSuperContacts(page, limit)` | `GET /api/admin/crm/contacts` | `crm_contacts` | `useSuperContactsQuery(page, limit)` | All tenant contacts |
| `/admin/crm/opportunities` | GET | `getSuperOpportunities(page, limit)` | `GET /api/admin/crm/opportunities` | `crm_opportunities` | `useSuperOpportunitiesQuery(page, limit)` | All tenant opportunities |
| `/admin/storefront/overview` | GET | `getSuperStorefrontOverview()` | `GET /api/admin/storefront/overview` | `pos_products`, `orders` | `useSuperStorefrontOverviewQuery()` | Cross-tenant storefront overview |
| `/admin/storefront/products` | GET | `getSuperStorefrontProducts(page, limit)` | `GET /api/admin/storefront/products` | `pos_products` | `useSuperStorefrontProductsQuery(page, limit)` | All tenant products |
| `/admin/ai/overview` | GET | `getSuperAIOverview()` | `GET /api/admin/ai/overview` | `ai_predictions`, `ai_automation_rules` | `useSuperAIOverviewQuery()` | Cross-tenant AI overview |
| `/admin/ai/predictions` | GET | `getSuperPredictions(page, limit)` | `GET /api/admin/ai/predictions` | `ai_predictions` | `useSuperPredictionsQuery(page, limit)` | All tenant predictions |
| `/admin/settings` | GET | `getAdminSettings()` | `GET /api/admin/settings` | `platform_settings` | `useAdminSettingsQuery()` | Platform settings |
| `/admin/settings` | PUT | `updateAdminSettings(data)` | `PUT /api/admin/settings` | `platform_settings` | — | Update platform settings |
| `/admin/subscriptions` | GET | `getAdminSubscriptions(params?)` | `GET /api/admin/subscriptions` | `tenant_subscriptions` | `useAdminSubscriptionsQuery(params?)` | List all subscriptions |
| `/admin/subscriptions/:id` | PUT | `updateAdminSubscription(id, data)` | `PUT /api/admin/subscriptions/:id` | `tenant_subscriptions` | — | Update subscription |
| `/admin/subscriptions/:id/cancel` | POST | `cancelAdminSubscription(id)` | `POST /api/admin/subscriptions/:id/cancel` | `tenant_subscriptions` | — | Cancel subscription |
| `/admin/subscriptions/:id/resume` | POST | `resumeAdminSubscription(id)` | `POST /api/admin/subscriptions/:id/resume` | `tenant_subscriptions` | — | Resume subscription |
| `/admin/reports` | GET | `getAdminReports()` | `GET /api/admin/reports` | — | `useAdminReportsQuery()` | Report templates |
| `/admin/reports/generate` | POST | `generateAdminReport(data)` | `POST /api/admin/reports/generate` | — | — | Generate report |
| `/admin/reports/scheduled` | GET | `getAdminScheduledReports()` | `GET /api/admin/reports/scheduled` | — | `useAdminScheduledReportsQuery()` | Scheduled reports |
| `/admin/reports/scheduled` | POST | `createAdminScheduledReport(data)` | `POST /api/admin/reports/scheduled` | — | — | Create scheduled report |
| `/admin/reports/scheduled/:id` | DELETE | `deleteAdminScheduledReport(id)` | `DELETE /api/admin/reports/scheduled/:id` | — | — | Delete scheduled report |
| `/admin/performance` | GET | `getAdminPerformance()` | `GET /api/admin/performance` | — | `useAdminPerformanceQuery()` | Tenant performance data |
| `/admin/performance/export` | GET | `exportAdminPerformance(format)` | `GET /api/admin/performance/export` | — | — | Export performance data |
| `/admin/health` | GET | `getAdminHealth()` | `GET /api/admin/health` | — | `useAdminHealthQuery()` | System health status |
| `/admin/health/metrics` | GET | `getAdminHealthMetrics()` | `GET /api/admin/health/metrics` | — | `useAdminHealthMetricsQuery()` | System health metrics |
| `/admin/audit` | GET | `getAdminAudit(params?)` | `GET /api/admin/audit` | `audit_log` | `useAdminAuditQuery(params?)` | Audit log entries |
| `/admin` | GET | `getAdmins()` | `GET /api/admin` | `admins` | `useAdminUsersQuery()` | List admin users |

## Tenant Billing

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/tenant/billing` | GET | `getTenantBilling()` | `GET /api/tenant/billing` | `tenant_subscriptions`, `subscription_plans`, `tenant_usage` | `useTenantBillingQuery()` | Tenant billing info |

## Auth & Onboarding

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/auth/login` | POST | `login(email, password)` | `POST /api/auth/login` | `admins` | `useLoginMutation()` | Admin login |
| `/auth/register` | POST | `register(data)` | `POST /api/auth/register` | `admins`, `tenants` | `useRegisterMutation()` | New tenant registration |
| `/auth/me` | GET | `getMe()` | `GET /api/auth/me` | `admins`, `tenants` | `useMeQuery()` | Get current user |
| `/auth/logout` | POST | `logout()` | `POST /api/auth/logout` | — | `useLogoutMutation()` | Logout |

## Settings

| Endpoint | Method | Frontend Function | Backend Handler | DB Tables | React Hook | Purpose |
|----------|--------|-------------------|-----------------|-----------|------------|---------|
| `/settings` | GET | `getSettings()` | `GET /api/settings` | `tenants` | `useSettingsQuery()` | Get tenant settings |
| `/settings` | PUT | `updateSettings(data)` | `PUT /api/settings` | `tenants` | `useUpdateSettingsMutation()` | Update tenant settings |

---

## POS — Authentication

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/pos/auth/login` | POST | `handlePosLoginRequest()` in `routes/pos/index.js` | `pos_users`, `pos_organizations`, `tenant_org_mapping` | Public | Cashier login (returns JWT + refresh token) |
| `/pos/auth/refresh` | POST | `routes/pos/index.js` | `pos_users` | POS JWT (refresh) | Refresh POS session token |

## POS — Products, Orders, Dashboard

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/pos/products` | GET | `routes/pos/index.js` | `pos_products` | POS auth | List active products for cashier's org |
| `/pos/orders` | POST | `routes/pos/index.js` | `pos_transactions`, `pos_transaction_items`, `pos_products`, `order_discounts`, `pos_tables` | POS auth | Create order (idempotent, with stock deduction + promo engine) |
| `/pos/orders` | GET | `routes/pos/index.js` | `pos_transactions`, `pos_users` | POS auth | List orders (paginated, `?raw=1` for legacy array) |
| `/pos/orders/:id` | GET | `routes/pos/index.js` | `pos_transactions`, `pos_transaction_items`, `pos_products` | POS auth | Get single order with line items |
| `/pos/dashboard` | GET | `routes/pos/index.js` | `pos_transactions`, `pos_products`, `pos_organizations` | POS auth | Today's revenue, order count, active products, recent orders |

## POS — Shifts

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/pos/shifts/active` | GET | `routes/pos/index.js` | `pos_shifts` | POS auth | Check if cashier has an open shift |
| `/pos/shifts/open` | POST | `routes/pos/index.js` | `pos_shifts` | POS auth | Open a new shift (opening cash) |
| `/pos/shifts/close` | POST | `routes/pos/index.js` | `pos_shifts`, `pos_transactions` | POS auth | Close shift (count cash, compute discrepancy) |

## POS — Tables (Restaurant)

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/pos-tables` | GET | `pos-tables.js` | `pos_tables` | Admin auth (tenant-scoped) | List tables grouped by section |
| `/pos-tables` | POST | `pos-tables.js` | `pos_tables` | Admin auth | Create table (admin only) |
| `/pos-tables/:id` | PUT | `pos-tables.js` | `pos_tables` | Admin auth | Update table (admin only) |
| `/pos-tables/:id/status` | PATCH | `pos-tables.js` | `pos_tables` | Admin auth | Move table through lifecycle (available/occupied/reserved/cleaning) |
| `/pos-tables/:id/reserve` | PATCH | `pos-tables.js` | `pos_tables` | Admin auth | Reserve table with party details |
| `/pos-tables/:id/release` | PATCH | `pos-tables.js` | `pos_tables` | Admin auth | Release a reserved table |
| `/pos-tables/:id` | DELETE | `pos-tables.js` | `pos_tables` | Admin auth | Delete table (admin only) |

## POS — Barcode Lookup

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/pos/products/barcode/:code` | GET | `pos-barcode.js` | `pos_products` | Tenant-scoped | Look up product by SKU or barcode |

## POS — User Management

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/pos-users` | GET | `pos-users.js` | `pos_users`, `tenants` | Admin auth (super_admin/admin) | List POS users (paginated, filterable by role/search) |
| `/pos-users` | POST | `pos-users.js` | `pos_users`, `pos_stores` | Admin auth | Create POS user (cashier/manager/admin) |
| `/pos-users/:id` | PATCH | `pos-users.js` | `pos_users` | Admin auth | Partial update POS user |
| `/pos-users/:id` | DELETE | `pos-users.js` | `pos_users` | Admin auth | Soft-delete POS user |
| `/pos-users/:id/reset-password` | POST | `pos-users.js` | `pos_users` | Admin auth | Reset POS user password |

## Upload & Media

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/upload` | POST | `upload.js` | R2 bucket (`MEDIA_BUCKET`) | Auth | Upload image to R2 (multipart or octet-stream, ≤8MB, jpg/png/webp/gif) |
| `/media/*` | GET | `upload.js` (mediaRoutes) | R2 bucket (`MEDIA_BUCKET`) | Public | Stream stored media object (immutable cache, tenant-scoped keys) |

## Payments (Stripe Mock)

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/payments/create-intent` | POST | `payments.js` (`handleCreatePaymentIntent`) | `orders` | Auth | Create mock Stripe PaymentIntent for order |
| `/payments/confirm` | POST | `payments.js` (`handleConfirmPayment`) | `orders` | Auth | Confirm mock payment, mark order paid |
| `/payments/webhook` | POST | `payments.js` (`handleStripeWebhook`) | `orders` | x-webhook-secret header | Mock Stripe webhook (payment_intent.succeeded) |

## Onboarding (Self-Service)

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/public/signup` | POST | `onboarding.js` | `tenants`, `admins`, `pos_organizations` | Public | Create pending tenant + admin (returns onboarding token) |
| `/onboarding/status/:token` | GET | `onboarding.js` | `tenants` | Public (token) | Get onboarding progress for token |
| `/onboarding/setup` | POST | `onboarding.js` | `tenants`, `admins` | Public (token) | Complete onboarding (profile + auto-login token) |
| `/onboarding/tenant` | POST | `onboarding.js` | `tenants` | Public (token) | Partial tenant update during wizard |

## Leads (Contact / Reservation)

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/leads` | GET | `leads.js` | `leads` | Auth (admin) | List leads (paginated, filterable by status) |
| `/leads` | POST | `leads.js` | `leads` | Public (scope) | Submit contact/reservation form (SSE broadcast) |
| `/leads/:id` | PUT | `leads.js` | `leads` | Auth (admin) | Update lead status (new/contacted/converted/archived) |
| `/leads/:id` | DELETE | `leads.js` | `leads` | Auth (admin) | Delete lead |

## Price Overrides

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/price-overrides` | GET | `priceOverrides.js` | `price_overrides`, `pos_products` | Auth (tenant-scoped) | List overrides for product (filterable by date range) |
| `/price-overrides` | PUT | `priceOverrides.js` | `price_overrides` | Auth (tenant-scoped) | Bulk upsert overrides (null price = delete) |
| `/price-overrides` | DELETE | `priceOverrides.js` | `price_overrides` | Auth (tenant-scoped) | Remove single override |

## Tenant Billing

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/tenant/billing` | GET | `tenant-billing.js` | `tenant_subscriptions`, `subscription_plans`, `orders`, `pos_users` | Auth (tenant) | Current subscription, usage stats, plan options, billing history |

## Super Admin — Users & Stats

| Endpoint | Method | Backend Handler | DB Tables | Auth | Purpose |
|----------|--------|-----------------|-----------|------|---------|
| `/admin/users` | GET | `admin-users.js` (`handleAdminUsersList`) | `admins`, `tenants` | super_admin | List all admin users (paginated, search/role filter) |
| `/admin/users/:id` | PUT | `admin-users.js` (`handleAdminUserUpdate`) | `admins` | super_admin | Update admin user role (cannot modify super_admin) |
| `/admin/users/:id` | DELETE | `admin-users.js` (`handleAdminUserDelete`) | `admins` | super_admin | Soft-delete admin user (deactivate) |
| `/admin/stats` | GET | `admin-stats.js` (`handleAdminStatsRoute`) | `tenants`, `projects`, `rooms_new`, `orders`, `admins` | super_admin | Enhanced platform stats (aggregates, time-series, breakdowns, recent activity) |

---

## Summary Statistics

| Domain | Endpoints | Frontend Functions | DB Tables |
|--------|-----------|-------------------|-----------|
| Camps/Projects | 8 | 8 | 1 (`camps`) |
| Products | 5 | 5 | 3 (`products`, `product_lang`, `categories`) |
| Rooms | 7 | 7 | 1 (`rooms_new`) |
| Rate Plans | 5 | 5 | 1 (`rate_plans_new`) |
| Orders | 12 | 12 | 5 (`orders`, `customers`, `order_state`, `order_items`, `order_meal_plans`) |
| Customers | 3 | 3 | 1 (`customers`) |
| Meals | 5 | 5 | 3 (`meals`, `meal_lang`, `meal_categories`) |
| Meal Categories | 5 | 5 | 2 (`meal_categories`, `meal_categories_lang`) |
| Meal Schedules | 5 | 5 | 1 (`meal_schedules`) |
| Promotions | 6 | 6 | 1 (`promotions`) |
| Services | 17 | 17 | 4 (`service_definitions`, `service_items`, `service_bookings`, `service_reviews`, `service_availability`) |
| Inbox | 3 | 3 | 4 (`leads`, `orders`, `inbox_reads`, `inbox`) |
| Tags | 7 | 7 | 2 (`tags`, `project_tags`) |
| Meta | 4 | 4 | 2 (`tenant_meta`, `project_meta`) |
| Categories | 5 | 5 | 2 (`categories`, `category_lang`) |
| Reports | 6 | 6 | 3 (`orders`, `pos_transactions`, `meals`) |
| Inventory | 3 | 3 | 2 (`inventory_adjustments`, `pos_products`) |
| Marketplace | 5 | 5 | 4 (`marketplace_reviews`, `marketplace_categories`, `marketplace_project_categories`) |
| Planning | 5 | 5 | 1 (`plans_new`) |
| Financial | 14 | 14 | 7 (`accounts`, `journals`, `journal_entries`, `entry_lines`, `invoices`, `invoice_lines`, `payments`, `tax_rates`) |
| HR | 12 | 12 | 7 (`employees`, `leave_types`, `leave_requests`, `payroll_runs`, `payroll_lines`, `job_posts`, `applicants`) |
| Supply Chain | 14 | 14 | 7 (`warehouses`, `stock_quant`, `stock_transfers`, `purchase_orders`, `purchase_order_lines`, `boms`, `bom_lines`, `manufacturing_orders`) |
| CRM | 14 | 14 | 6 (`crm_contacts`, `crm_leads`, `crm_opportunities`, `crm_tasks`, `crm_tickets`, `crm_knowledge_articles`) |
| Storefront | 18 | 18 | 4 (`storefront_pages`, `storefront_blog_posts`, `storefront_blog_categories`, `pos_products`) |
| AI | 15 | 15 | 3 (`ai_predictions`, `ai_price_rules`, `ai_automation_rules`, `ai_automation_logs`) |
| Super Admin — Pillars | 20 | 20 | 8 (`invoices`, `employees`, `warehouses`, `crm_contacts`, `pos_products`, `ai_predictions`, `platform_settings`, `tenant_subscriptions`) |
| Super Admin — Users & Stats | 4 | 4 | 4 (`admins`, `tenants`, `projects`, `rooms_new`) |
| Auth | 4 | 4 | 2 (`admins`, `tenants`) |
| Settings | 2 | 2 | 1 (`tenants`) |
| POS — Auth | 2 | — | 3 (`pos_users`, `pos_organizations`, `tenant_org_mapping`) |
| POS — Products/Orders/Dashboard | 5 | — | 6 (`pos_transactions`, `pos_transaction_items`, `pos_products`, `order_discounts`, `pos_tables`, `pos_organizations`) |
| POS — Shifts | 3 | — | 2 (`pos_shifts`, `pos_transactions`) |
| POS — Tables | 7 | — | 1 (`pos_tables`) |
| POS — Barcode | 1 | — | 1 (`pos_products`) |
| POS — User Mgmt | 5 | — | 2 (`pos_users`, `pos_stores`) |
| Upload & Media | 2 | — | 1 (R2 bucket) |
| Payments | 3 | — | 1 (`orders`) |
| Onboarding | 4 | — | 3 (`tenants`, `admins`, `pos_organizations`) |
| Leads | 4 | 4 | 1 (`leads`) |
| Price Overrides | 3 | — | 2 (`price_overrides`, `pos_products`) |
| Tenant Billing | 1 | 1 | 4 (`tenant_subscriptions`, `subscription_plans`, `orders`, `pos_users`) |
| **Total** | **~270+** | **~220+** | **~65 unique tables** |
