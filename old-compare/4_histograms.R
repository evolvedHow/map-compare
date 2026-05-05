library(tidyverse)
library(scales)
library(readxl)

options(scipen=999)


###############
### INPUTS

district_table_filepath <- "data/output/cooper_congress.csv"

out_filepath <- "assessment/cooper_congress/histograms/"
dtype <- "cooper_congress"

#### Select the group depending on the district type
#district_json <- jsonlite::fromJSON("~/spatial/FDGA/Data/remedy_maps_2023/geo/processed/pgp_ensemble/Congress_scoredata-2023-11-27_cooper.json", flatten = T)

district_json <- jsonlite::fromJSON("~/spatial/FDGA/Data/PGP_results/2020/fdga_ensemble/GA Cong 9.1.json", flatten = T)
size = 8
width = 9.5
height = 1.94

# district_json <- jsonlite::fromJSON("~/spatial/FDGA/Data/PGP_results/2020/fdga_ensemble/GA House 9.1.json", flatten = T)
# size = 8
# width = 9.5
# height = 1.94

# district_json <- jsonlite::fromJSON("~/spatial/FDGA/Data/PGP_results/2020/fdga_ensemble/GA Sen 9.1.json", flatten = T)
# size = 10
# width = 9.5 
# height = 1.94


###############
### END INPUTS

### import district data

district_table <- read_csv(district_table_filepath)

district_count <- nrow(district_table)

#### count the number of competitive districts ####
comp_dist <- district_table |> 
  filter(partisan_lean >= .465 & partisan_lean <= .535)
comp_count <- nrow(comp_dist)

#### count the number of dem districts  ####
dem_dist <- district_table |> 
  filter(partisan_lean >= .5)
dem_count <- nrow(dem_dist)

#### count the number of bvap districts  ####
bvap_inf_dist <- district_table |> 
  filter(pct_bvap_ap >= .37 & pct_bvap_ap < .5)
bvap_inf_count <- nrow(bvap_inf_dist)

bvap_opp <- district_table |> 
  filter(pct_bvap_ap >= .5)
bvap_opp_count <- nrow(bvap_opp)

#### count the number of mvap inf districts  ####
mvap_inf_dist <- district_table |> 
  filter(pct_mvap >= .37 & pct_mvap < .5)
mvap_inf_count <- nrow(mvap_inf_dist)

#### count the number of mvap opp districts  ####
mvap_opp_dist <- district_table |> 
  filter(pct_mvap >= .5)
mvap_opp_count <- nrow(mvap_opp_dist)

#### count the number of hvap inf districts  ####
hvap_inf_dist <- district_table |> 
  filter(pct_hvap >= .37 & pct_hvap < .5)
hvap_inf_count <- nrow(hvap_inf_dist)

#### count the number of hvap opp districts  ####
hvap_opp_dist <- district_table |> 
  filter(pct_hvap >= .5)
hvap_opp_count <- nrow(hvap_opp_dist)

#### count the number of avap inf districts  ####
avap_inf_dist <- district_table |> 
  filter(pct_avap_ap >= .37 & pct_avap_ap < .5)
avap_inf_count <- nrow(avap_inf_dist)

#### count the number of avap opp districts  ####
avap_opp_dist <- district_table |> 
  filter(pct_avap_ap >= .5)
avap_opp_count <- nrow(avap_opp_dist)

###### function to make axis breaks integer only for the histogram
brk <- function(x) seq(ceiling(x[1]), floor(x[2]), by = 1)


#### create histograms - congress dem competetive ####
ensemble_comp_pcts <- as.data.frame(district_json$avgcompdists) %>%
  rename(comp = `district_json$avgcompdists`) 

ensemble_comp_count <- ensemble_comp_pcts %>% 
  group_by(comp) %>% 
  summarise(count = n()) %>% 
  mutate(pct = round(count/sum(count), 2))

comp_hist <- ggplot(ensemble_comp_pcts, aes(x=comp)) +
  geom_histogram(color="#abcce0", fill="#0571B0",size=.25, binwidth=1) +
  geom_vline(aes(xintercept = comp_count),linewidth = 2, colour = "#db1623") +
  scale_x_continuous(expand = c(0, 0), breaks = function(x) seq(ceiling(x[1]), floor(x[2]), by = 1)) +
  scale_y_continuous(expand = c(0, 0), labels = scales::comma) +
  theme_classic() +
  theme(
    panel.background = element_rect(fill = "transparent"), # bg of the panel
    plot.background = element_rect(fill = "transparent", color = NA), # bg of the plot
    panel.grid.major = element_blank(),
    panel.grid.minor = element_blank(),
    axis.text = element_text(color="black", size=14),
    axis.title = element_blank(),
    axis.ticks = element_blank()) 

ggsave(comp_hist, filename = paste0(out_filepath, dtype, "_comp_histogram.png"),  
       bg = "transparent", width = 4.04, height = 4.42)

#### congress dem wins ####
ensemble_dem_wins <- as.data.frame(district_json$avgWins) %>%
  rename(wins = `district_json$avgWins`) %>% 
  mutate(r_wins = district_count - wins)

ensemble_dem_wins_count <- ensemble_dem_wins %>% 
  group_by(wins) %>% 
  summarise(count = n()) %>% 
  mutate(pct = round(count/sum(count), 2))

wins_hist <- ggplot(ensemble_dem_wins, aes(x=wins)) + 
  geom_histogram(color="#abcce0", fill="#0571B0",size=.25, binwidth=1) +
  geom_vline(aes(xintercept = dem_count),size = 2, colour = "#db1623") +
  scale_x_continuous(expand = c(0, 0), breaks = function(x) seq(ceiling(x[1]), floor(x[2]), by = 1)) +
  scale_y_continuous(expand = c(0, 0), labels = scales::comma) +
  theme_classic() +
  theme(
    panel.background = element_rect(fill = "transparent"), # bg of the panel
    plot.background = element_rect(fill = "transparent", color = NA), # bg of the plot
    panel.grid.major = element_blank(),
    panel.grid.minor = element_blank(),
    axis.text = element_text(color="black", size=14),
    axis.title = element_blank(),
    axis.ticks = element_blank()) 

ggsave(wins_hist, filename = paste0(out_filepath, dtype, "_wins_histogram.png"),  
       bg = "transparent", width = 4.04, height = 4.42)

#### create histograms - congress bvap #### - DO NOT RUN WITH CURRENT ENSEMBLE
# ensemble_bvap_inf_pcts <- as.data.frame(district_json$`BVAP37-50`) 
# 
# colnames(ensemble_bvap_inf_pcts)[1] <-  "bvap_inf"
# 
# ensemble_bvap_inf_count <- ensemble_bvap_inf_pcts %>% 
#   group_by(bvap_inf) %>% 
#   summarise(count = n()) %>% 
#   mutate(pct = round(count/sum(count), 2))
# 
# bvap_inf_hist <- ggplot(ensemble_bvap_inf_pcts, aes(x=bvap_inf)) + 
#   geom_histogram(color="#abcce0", fill="#0571B0", size=.25, binwidth=1) +
#   geom_vline(aes(xintercept = bvap_inf_count),size = 2, colour = "#db1623") +
#   scale_x_continuous(expand = c(0, 0), breaks = function(x) seq(ceiling(x[1]), floor(x[2]), by = 1)) +
#   scale_y_continuous(expand = c(0, 0), labels = scales::comma) +
#   theme_classic() +
#   theme(
#     panel.background = element_rect(fill = "transparent"), # bg of the panel
#     plot.background = element_rect(fill = "transparent", color = NA), # bg of the plot
#     panel.grid.major = element_blank(),
#     panel.grid.minor = element_blank(),
#     axis.text = element_text(color="black", size=14),
#     axis.title = element_blank(),
#     axis.ticks = element_blank()) 
# 
# ggsave(bvap_inf_hist, filename = paste0(out_filepath, dtype, "_bvap_inf_histogram.png"),  
#        bg = "transparent", width = 4.04, height = 4.42)
# 
# ###### Create histograms for VRA districts ######
# ensemble_bvap_opp_pcts <- as.data.frame(district_json$`VRADists`) 
# 
# colnames(ensemble_bvap_opp_pcts)[1] <-  "bvap_opp"
# 
# ensemble_bvap_opp_count <- ensemble_bvap_opp_pcts %>% 
#   group_by(bvap_opp) %>% 
#   summarise(count = n()) %>% 
#   mutate(pct = round(count/sum(count), 2))
# 
# bvap_opp_hist <- ggplot(ensemble_bvap_opp_pcts, aes(x=bvap_opp)) + 
#   geom_histogram(color="#abcce0", fill="#0571B0", size=.25, binwidth=1) +
#   geom_vline(aes(xintercept = bvap_opp_count),size = 2, colour = "#db1623") +
#   scale_x_continuous(expand = c(0, 0), breaks = function(x) seq(ceiling(x[1]), floor(x[2]), by = 1)) +
#   scale_y_continuous(expand = c(0, 0), labels = scales::comma) +
#   theme_classic() +
#   theme(
#     panel.background = element_rect(fill = "transparent"), # bg of the panel
#     plot.background = element_rect(fill = "transparent", color = NA), # bg of the plot
#     panel.grid.major = element_blank(),
#     panel.grid.minor = element_blank(),
#     axis.text = element_text(color="black", size=14),
#     axis.title = element_blank(),
#     axis.ticks = element_blank()) 
# 
# ggsave(bvap_opp_hist, filename = paste0(out_filepath, dtype, "_bvap_opp_histogram.png"),  
#        bg = "transparent", width = 4.04, height = 4.42)

### Dual histogram

dem_rep_wins <- ggplot(ensemble_dem_wins) +
  geom_histogram(aes(x=wins), color="#c2a1ba", fill="#1f4bae", size=.25, binwidth=1, alpha = .75) +
  geom_histogram(aes(x=r_wins), color="#c2a1ba", fill="#db1623", size=.25, binwidth=1, alpha = .75) +
  scale_x_continuous(limits = c(0, district_count), expand = c(0, 0), breaks = function(x) seq(ceiling(x[1]), floor(x[2]), by = 1)) +
  scale_y_continuous(expand = c(0, 0), labels = scales::comma) +
  theme_classic() +
  theme(
    panel.background = element_rect(fill = "transparent"), # bg of the panel
    plot.background = element_rect(fill = "transparent", color = NA), # bg of the plot
    panel.grid.major = element_blank(),
    panel.grid.minor = element_blank(),
    axis.text.x = element_text(color="black", size=size),
    axis.text.y = element_blank(),
    axis.title = element_blank(),
    axis.ticks = element_blank())

ggsave(dem_rep_wins, filename = paste0(out_filepath, dtype, "_partisan_dual_histogram.png"), 
       width = width, height = height)


# proposed3_count <- data.frame(type = c("Black Influence Districts (BVAP 37% - 50%)", "Black Opportunity Districts (BVAP >= 50%)", 
#                                        "Minority Influence Districts (MVAP 37% - 50%)", "Minority Opportunity Districts (MVAP >= 50%)", 
#                                        "Hispanic Influence Districts (HVAP 37% - 50%)", "Hispanic Opportunity Districts (HVAP >= 50%)",
#                                        "Asian Influence Districts (AVAP 37% - 50%)", "Asian Opportunity Districts (AVAP >= 50%)",
#                                        "Competitive Districts", "Democratic Districts", "Republican Districts"),
#                               `congress, Proposed Count` = c(bvap_inf_count, bvap_opp_count, 
#                                                              mvap_inf_count, mvap_opp_count, 
#                                                              hvap_inf_count, hvap_opp_count, 
#                                                              avap_inf_count, avap_opp_count, 
#                                                              comp_count, dem_count, district_count - dem_count))
# 
# #### Start the handout
# handout_value <- data.frame(Value = c(nrow(congress_election) - congress_dem, congress_dem, NA, congress_comp, 
#                                       NA, NA, NA, NA, congress_bvap_opp, congress_bvap_inf, congress_mvap_opp, congress_mvap_inf, 
#                                       congress_hvap_opp, congress_hvap_inf, congress_avap_opp, congress_avap_inf, NA))
# 
# handout <- read_excel("RawData/proposed_2021/coordination/20211027_First_Look_Handout_Variables.xlsx", 
#                       sheet = "Congress",
#                       skip = 2) %>% 
#   select(-Value) %>% 
#   cbind(handout_value)
# 
# write_csv(handout, "~/spatial/FDGA/Data/analysis/PGP_findings/2021/congress_p3/congress_p3_handout.csv")

############# Create counts for MVAP, AVAP and HVAP


# write_csv(proposed3_count, "analysis/PGP_findings/2021/congress_p3/histogram_counts/proposed3_congress_dem_count.csv")
# write_csv(ensemble_comp_count, "analysis/PGP_findings/2021/congress_p3/histogram_counts/proposed3_congress_competitive_districts_histogram_count.csv")
# write_csv(ensemble_dem_wins_count, "analysis/PGP_findings/2021/congress_p3/histogram_counts/proposed3_congress_dem_wins_districts_histogram_count.csv")
# write_csv(ensemble_bvap_inf_count, "analysis/PGP_findings/2021/congress_p3/histogram_counts/proposed3_congress_bvap_influence_districts_histogram_count.csv")
# write_csv(ensemble_bvap_opp_count, "analysis/PGP_findings/2021/congress_p3/histogram_counts/proposed3_congress_bvap_opportunity_districts_histogram_count.csv")