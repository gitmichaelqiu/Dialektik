#!/bin/bash
# Wrapper around lipo that fixes -verify_arch behaviour
# The real lipo -verify_arch occasionally returns non-zero for valid fat binaries.
if [[ "$*" == *"-verify_arch"* ]]; then
  # Parse the binary path (first arg) and architecture args
  BINARY=""
  ARCHS=()
  NEXT_IS_ARCH=false
  for arg in "$@"; do
    if [ "$arg" = "-verify_arch" ]; then
      NEXT_IS_ARCH=true
    elif [ "$NEXT_IS_ARCH" = true ]; then
      ARCHS+=("$arg")
    else
      BINARY="$arg"
    fi
  done

  if [ -n "$BINARY" ] && [ ${#ARCHS[@]} -gt 0 ]; then
    # Use lipo -info instead to check architectures
    INFO=$(/usr/bin/lipo -info "$BINARY" 2>/dev/null)
    if echo "$INFO" | grep -q "are:"; then
      AVAILABLE=$(echo "$INFO" | sed 's/.*are: //')
      for arch in "${ARCHS[@]}"; do
        if ! echo "$AVAILABLE" | grep -qw "$arch"; then
          /usr/bin/lipo "$@"
          exit $?
        fi
      done
      exit 0  # All architectures found
    fi
  fi
fi
/usr/bin/lipo "$@"
