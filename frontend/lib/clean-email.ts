/**
 * An address copied out of Outlook, Excel or WhatsApp often carries a
 * non-breaking or zero-width space the eye cannot see. The browser only trims
 * plain spaces from an email field, so the rest reach its validation and it
 * refuses with "should not contain the symbol ' '" — on an address that looks
 * correct. No email address holds whitespace, so drop all of it as typed.
 */
export function cleanEmail(value: string): string {
  return value.replace(/[\s​-‍⁠﻿]/g, "");
}
