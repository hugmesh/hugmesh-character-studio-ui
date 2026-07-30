# CROSS-USER ISOLATION — the avatar is the studio's only cross-surface write, and
# it is keyed to the Casdoor subject. Two DISTINCT owners must not collide: bob's
# avatar write must never clobber alice's, and each profile read returns only its
# own avatarUrl. This is the owner-vs-other-user isolation class the platform's
# role-matrix wave never covered for this remote (the "no role gates" note is true
# for ROLES but NOT for per-user data isolation).
#
# VICTIM-CREATES-FIRST: every avatarUrl compared is a REAL server-returned value
# captured in-scenario (alice writes and re-reads BEFORE bob writes; alice is then
# re-read AFTER bob's write to prove it was untouched). The two users compose
# deliberately-distinct fur colours so "differ" holds whether the avatar URL is
# content-addressed or per-subject. Two live identities coexist, each in its OWN
# context carrying its OWN bff_ cookie — the isolation is asserted with both users
# live, never by swapping one session.
#
# @cluster — GENERATED for discovery; SKIPPED at runtime unless E2E_LIVE=1.
@cluster @cross-user
Feature: Avatar isolation — one user's avatar write never reaches another user
  As the platform
  I must scope every avatar write to its owner subject
  So a user can never clobber or read another user's avatar

  Scenario: two users set distinct avatars and neither write reaches the other
    Given "alice" is signed in with a real session
    And "bob" is signed in with a real session
    And "alice" has the character studio open
    And "bob" has the character studio open
    When "alice" notes their current profile avatar
    And "bob" notes their current profile avatar
    # alice writes a RED-fur avatar and confirms her own profile changed…
    And "alice" recolours their "fur" region to "#c0392b"
    And "alice" sets the character as their avatar
    Then "alice" sees the avatar set successfully
    And "alice"'s profile avatar changed from the noted value
    # …then bob writes a BLUE-fur avatar in his own session…
    When "bob" recolours their "fur" region to "#2e6fc0"
    And "bob" sets the character as their avatar
    Then "bob" sees the avatar set successfully
    And "bob"'s profile avatar changed from the noted value
    # …and the isolation holds: bob's write did not touch alice's avatar, and the
    # two owners' avatarUrls are distinct.
    And "alice"'s profile avatar is unchanged since their write
    And "alice"'s profile avatar differs from "bob"'s
