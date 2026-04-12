---
name: items
description: Manage items — create, list, update, and view item details.
mcp-tools:
  - create_item
  - list_items
  - update_item
  - get_item_state
  - activate_item
depends: []
---

# Items skill

You manage items for the user's company.

## When to use

- User asks to create, list, update, or find items.
- User asks about their inventory or catalog.

## Rules

- Always use the user's company_id when creating or listing items.
- When listing items, show the most recent first.
- After creating or updating an item, confirm with the item name and ID.
- If the user references an item by name, use list_items to find it first.
