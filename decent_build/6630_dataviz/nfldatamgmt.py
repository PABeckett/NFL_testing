#import nfl_data_py as nfl #deprecated
#nfl.import_pbp_data(2020)
#nfl.see_pbp_cols()

'''
Core Loading Functions
load_pbp() - play-by-play data
load_player_stats() - player game or season statistics
load_team_stats() - team game or season statistics
load_schedules() - game schedules and results
load_players() - player information
load_rosters() - team rosters
load_rosters_weekly() - team rosters by season-week
load_snap_counts() - snap counts
load_nextgen_stats() - advanced stats from nextgenstats.nfl.com
load_ftn_charting() - charted stats from ftnfantasy.com/data
load_participation() - participation data (historical)
load_draft_picks() - nfl draft picks
load_injuries() - injury statuses and practice participation
load_contracts() - historical contract data from OTC
load_officials() - officials for each game
load_combine() - nfl combine results
load_depth_charts() - depth charts
load_trades() - trades
load_ff_playerids() - ffverse/dynastyprocess player ids
load_ff_rankings() - fantasypros rankings
load_ff_opportunity() - expected yards, touchdowns, and fantasy points
'''
import nflreadpy as nfl

#pbp = nfl.load_pbp()
#pbp_p = pbp.to_pandas()
#print(pbp_p.head)
#play by play - kinda iffy stuff, could be cool for prediction though

player_stats = nfl.load_player_stats(2025)
ps_p = player_stats.to_pandas()
print(ps_p.head)
ps_p.to_csv('playerdata.csv')
#playerdata is week-by-week

team_stats = nfl.load_team_stats(2025)
ts_p = team_stats.to_pandas()
print(ts_p.head)
ts_p.to_csv('teamdata.csv')
#teamdata is week-by-week

