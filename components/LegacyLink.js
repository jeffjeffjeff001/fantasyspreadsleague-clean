// components/LegacyLink.js
import NextLink from 'next/link'

export default function Link({ children, ...props }) {
  // inject legacyBehavior so nested <a> still works
  return <NextLink {...props} legacyBehavior>{children}</NextLink>
}
