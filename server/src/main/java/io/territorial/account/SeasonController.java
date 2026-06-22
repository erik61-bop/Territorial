package io.territorial.account;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Season ladder API (authenticated): the current season, your progress, and the season leaderboard. */
@RestController
@RequestMapping("/api/season")
public class SeasonController {
    private final AccountRepository accounts;

    public SeasonController(AccountRepository accounts) {
        this.accounts = accounts;
    }

    @GetMapping
    public ResponseEntity<?> season(@AuthenticationPrincipal Long accountId) {
        if (accountId == null) return ResponseEntity.status(401).build();
        Account me = accounts.findById(accountId).orElse(null);
        long cur = Seasons.currentId();
        long myPoints = (me != null && me.getSeasonId() == cur) ? me.getSeasonPoints() : 0;
        boolean unlocked = me != null && me.owns(Seasons.emblemId(cur));

        List<Map<String, Object>> board = new ArrayList<>();
        for (Account a : accounts.findTop20BySeasonIdAndSeasonPointsGreaterThanOrderBySeasonPointsDesc(cur, 0))
            board.add(Map.of("name", a.getDisplayName(), "points", a.getSeasonPoints(),
                    "emblem", a.getEmblem() == null ? "" : a.getEmblem()));

        return ResponseEntity.ok(Map.of(
                "season", Seasons.number(),
                "endsInDays", Seasons.endsInDays(),
                "points", myPoints,
                "rewardPoints", Seasons.REWARD_POINTS,
                "rewardEmoji", Seasons.emblemEmoji(cur),
                "rewardId", Seasons.emblemId(cur),
                "unlocked", unlocked,
                "leaderboard", board));
    }
}
