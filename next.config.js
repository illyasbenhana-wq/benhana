const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: 'ilyas-benhana',
  project: 'ethosfi-nextjs-mvp',
})
