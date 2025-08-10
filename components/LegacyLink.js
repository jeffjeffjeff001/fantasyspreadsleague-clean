// components/LegacyLink.js
import NextLink from 'next/link'

export default function Link({ children, ...props }) {
  // we inject legacyBehavior so you can keep nested <a> tags
  return (
    <NextLink {...props} legacyBehavior>
      {children}
    </NextLink>
  )
}
