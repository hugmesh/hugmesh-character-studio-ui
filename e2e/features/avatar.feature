# ══════════════════════════════════════════════════════════════════════════════
# ROLE-MATRIX COVERAGE NOTE — read this, it is deliberate, not an omission.
#
# character-studio has NO role gates. It is a self-service creative tool: every
# control (part-picker, palette, draw, expression preview, PNG download) is
# available to any signed-in user, with no admin/mod/owner branching and no
# per-role visibility. So the role×feature matrices used by other remotes
# (matrix-ui, admin-ui, mod-ui) are genuinely N/A here — fabricating role
# scenarios would assert behaviour the app does not have.
#
# The ONE cross-surface touch is `Set as avatar`: it writes the user's
# platform-wide profile avatar via the off-stack character-bff (the A3 moderation
# gate runs server-side; a blocked image returns 422, an unauthenticated caller
# 401). That single write is the only identity-relevant surface, and it is covered
# below (the per-user ISOLATION half lives in avatar-cross-user.feature).
# ══════════════════════════════════════════════════════════════════════════════
#
# @cluster: `exportAvatar` POSTs the composed PNG to `/bff/user/profile/avatar`
# and the read-back GETs `/bff/user/profile` — both off-stack. GENERATED for
# discovery; SKIPPED at runtime unless E2E_LIVE=1 (fixtures.ts Before hook).
@cluster @role-matrix
Feature: Set as avatar — the studio's only cross-surface write
  As a signed-in user
  I want to publish my composed character as my avatar
  So that my profile/Matrix avatar reflects it

  # Honest write: a REAL Casdoor session (HttpOnly bff_ cookie), then prove the
  # PLATFORM profile actually changed — not just the studio's own status text.
  Scenario: a signed-in user's avatar write changes their platform profile avatar
    Given "alice" is signed in with a real session
    And "alice" has the character studio open
    When "alice" notes their current profile avatar
    And "alice" recolours their "fur" region to "#c0392b"
    And "alice" sets the character as their avatar
    Then "alice" sees the avatar set successfully
    And "alice"'s profile avatar changed from the noted value

  # The 401 branch: a fresh context with NO bff_ cookie must get the actionable
  # sign-in message, never the generic "Avatar export failed." A live gateway
  # answers 401 for the cookieless POST, exercising this deterministically.
  Scenario: setting an avatar while signed out shows the sign-in message
    Given the character studio is loaded
    When I set the character as my avatar
    Then the export status reads "Sign in to set your avatar."
