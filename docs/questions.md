# Business Logic Questions Log

## 1. Account Standing Score mechanics
**Question**: The prompt mentions an internal account standing score (e.g., users below 60/100) and penalties like "two no-shows in the last 30 days", but it does not specify how the score is initially assigned, what specific actions increase or decrease the score by how much, or what the maximum/baseline score is.
**My Understanding**: Users start with a baseline score of 100/100, and points are deducted for negative actions (like no-shows or late cancellations) and slowly regained through positive actions (like attending classes on time).
**Solution**: Implemented a score configuration table that defines the point values for specific actions (e.g., -20 for no-show, +5 for attendance) and a scheduled job that decays penalties over time or applies points for good attendance.

## 2. Definition of "Peak Hours"
**Question**: The prompt states that users with low scores are "blocked from peak hours unless approved", but does not define what times constitute "peak hours" or if they vary by day or resource.
**My Understanding**: Peak hours are specific time ranges (e.g., 5 PM - 8 PM on weekdays, 8 AM - 12 PM on weekends) that apply globally to all reservable resources.
**Solution**: Added a `peak_hours` configuration table to define these time ranges by day of week, allowing the Studio Manager to adjust them dynamically.

## 3. "Order split/merge" processing and state management
**Question**: When an order is split into instant activation (e.g., membership) and front-desk pickup (e.g., merchandise), does the entire order share a single payment, and how are partial fulfillments tracked (e.g., if a user picks up one shirt but not another)?
**My Understanding**: A single parent order handles the single financial transaction, but it is split into multiple "fulfillment items" or sub-orders, each with its own state machine for fulfillment (e.g., "Active" for membership, "Awaiting Pickup" for merchandise).
**Solution**: Implemented a relational structure: `orders` (1) -> `order_items` (N) -> `fulfillments` (N), allowing individual items to be picked up and tracked independently while keeping payment unified in the parent order.

## 4. 15-minute cleaning buffer applicability
**Question**: The UI highlights conflicts including a "required 15-minute cleaning buffer", but it isn't clear if this buffer applies universally to all resources (rooms, equipment, seats) and if it is dynamically added after every reservation.
**My Understanding**: The cleaning buffer is only strictly required for rooms and specific large equipment, not individual seats in a class, and must be automatically appended to the end of a reservation's time slot for these specific resources.
**Solution**: Added a boolean flag `requires_cleaning_buffer` to the Resource model. If true, the system automatically enforces a 15-minute gap after requested times during availability calculation and scheduling.

## 5. Reverting fines and account standing changes on refund
**Question**: The prompt lists an audit trail for "check-ins, fines, refunds", but does not clarify whether refunding a fine or canceling a penalized reservation reverses the associated account standing score penalty.
**My Understanding**: If an Auditor or Manager waives a fine or refunds a penalized action, the account score impact should also be automatically reversed to maintain fairness.
**Solution**: Tied the account score ledger entries to the specific order or reservation ID. Reversing or refunding the source transaction automatically creates a compensating entry in the score ledger to restore the user's points.

## 6. Auto-suggested time slots logic
**Question**: It is mentioned that the UI supports "auto-suggested time slots" during scheduling conflicts, but it's unclear if this should prioritize the same resource on a different day, or a different resource at the same time.
**My Understanding**: Auto-suggestions should first attempt to find availability for the same resource on the same day at adjacent times, then fallback to a different, comparable resource at the requested time, and finally a different day.
**Solution**: Designed a tiered recommendation algorithm in the Koa backend that queries for alternative slots within +/- 2 hours for the requested resource, then searches similar resources in the same category if the original is fully booked.
