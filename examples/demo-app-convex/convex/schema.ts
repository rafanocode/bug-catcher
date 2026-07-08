import { defineSchema } from 'convex/server'

// The demo app owns no tables of its own — bug-catcher-convex's
// submissions table lives inside the component, isolated from this schema.
export default defineSchema({})
