import { defineComponent } from 'convex/server'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'

const component = defineComponent('bugCatcher')
component.use(rateLimiter)

export default component
