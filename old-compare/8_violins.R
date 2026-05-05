### compare range of previous and adopted maps

library(tidyverse)

out_filepath <- "assessment/cooper_congress/violins/"
dtype <- "cooper_congress"

# Senate
remedy <- read_csv("data/output/cooper_congress.csv") |> 
  mutate(safety = case_when(partisan_lean   < .4 ~ "1. safe R (< 40% Dem)",
                            partisan_lean   >= .4 & partisan_lean   < .465  ~ "2. lean R (40% - 46.5% Dem)",
                            partisan_lean   >= .465 & partisan_lean   < .5  ~ "3. competitive R (46.5% - 50% Dem)",
                            partisan_lean   >= .5 & partisan_lean   < .535  ~ "4. competitive D (50% - 53.5% Dem)",
                            partisan_lean   >= .535 & partisan_lean   < .6  ~ "5. lean D (53.5% - 60% Dem)",
                            partisan_lean   >= .6  ~ "6. safe D (> 60% Dem)"),
         map = "US Congress, Cooper Illustrative Map") |> 
  select(map, district, pop, vap, pct_bvap_ap, pct_avap_ap, pct_hvap, pct_mvap, partisan_lean, safety) |> 
  rename(pct_bvap = pct_bvap_ap,
         pct_avap = pct_avap_ap,
         tvap = vap)

enacted <- st_read("geo/current/enacted_congress22_40pct.geojson") |> 
  st_drop_geometry() |> 
  mutate(safety = case_when(partisan   < .4 ~ "1. safe R (< 40% Dem)",
                            partisan   >= .4 & partisan   < .465  ~ "2. lean R (40% - 46.5% Dem)",
                            partisan   >= .465 & partisan   < .5  ~ "3. competitive R (46.5% - 50% Dem)",
                            partisan   >= .5 & partisan   < .535  ~ "4. competitive D (50% - 53.5% Dem)",
                            partisan   >= .535 & partisan   < .6  ~ "5. lean D (53.5% - 60% Dem)",
                            partisan   >= .6  ~ "6. safe D (> 60% Dem)"),
         map = "US Congress, Enacted Map") |> 
  rename(partisan_lean = partisan,
         pct_bvap = pct_bvp,
         pct_avap = pct_avp,
         pct_hvap = pct_hvp,
         pct_mvap =pct_bp_) |> 
  select(map, district, pop, tvap, pct_bvap, pct_avap, pct_hvap, pct_mvap, partisan_lean, safety)

two <- remedy |> 
  rbind(enacted) 

counts <- two %>% 
  group_by(map) %>% 
  summarise(bvap_maj = sum(pct_bvap >= .5),
            bvap_opp = sum(pct_bvap >= .37 & pct_bvap < .5),
            mvap_maj = sum(pct_mvap >= .5),
            mvap_opp = sum(pct_mvap >= .37 & pct_mvap < .5),
            hvap_maj = sum(pct_hvap >= .5),
            hvap_opp = sum(pct_hvap >= .37 & pct_hvap < .5),
            avap_maj = sum(pct_avap >= .5),
            avap_opp = sum(pct_avap >= .37 & pct_avap < .5))

####### Violin ########

partisan_violin <- ggplot(two, aes(x=map, y=partisan_lean)) + geom_violin() + geom_count(alpha=0.5, size = 2) +
  theme(panel.background = element_blank(),
        axis.title.x = element_blank(),
        axis.ticks.x = element_blank(),
        legend.position = "none") +
  annotate("rect", xmin = 0, 
           xmax = 3,
           ymin = c(0, .4, .465, .5, .535, .6),
           ymax =c(.4, .465, .5, .535, .6, 1), 
           alpha = .70, fill = c("#bc131e", "#eb4956", "#c36e9e", "#7279db", "#3c6ebf", "#1f4bae"))  +
  scale_y_continuous(labels = scales::percent_format()) +
  labs(y = "Partisan Lean (% Democrat)")

bvap_violin <- ggplot(two, aes(x=map, y=pct_bvap)) + geom_violin() + geom_count(alpha=0.5, size = 2) +
  theme(panel.background = element_blank(),
        axis.title.x = element_blank(),
        axis.ticks.x = element_blank(),
        legend.position = "none") +
  annotate("rect", xmin = 0, 
           xmax = 3,
           ymin = c(0, .37, .5),
           ymax =c(.37, .5, 1), 
           alpha = .70, fill = c("#ffffff", "#aba8d0", "#664296")) +
  geom_text(data=counts,aes(x=map,y=1.08,label= paste0(bvap_maj, " Black-Majority districts")), size=3, color="#664296") +
  geom_text(data=counts,aes(x=map,y=1.03,label= paste0(bvap_opp, " Black-Influence districts")), size=3, color="#aba8d0") +
  scale_y_continuous(labels = scales::percent_format()) +
  labs(y = "Percent Black-Voting Age Population",
       title = "Congressional Maps Range Comparison") 

mvap_violin <- ggplot(two, aes(x=map, y=pct_mvap)) + geom_violin() + geom_count(alpha=0.5, size = 2) +
  theme(panel.background = element_blank(),
        axis.title.x = element_blank(),
        axis.ticks.x = element_blank(),
        legend.position = "none") +
  annotate("rect", xmin = 0, 
           xmax = 3,
           ymin = c(0, .37, .5),
           ymax =c(.37, .5, 1), 
           alpha = .70, fill = c("#ffffff", "#fcc0c4", "#91318f"))  +
  geom_text(data=counts,aes(x=map,y=1.08,label= paste0(mvap_maj, " BIPOC-Majority districts")), size=3, color="#91318f") +
  geom_text(data=counts,aes(x=map,y=1.03,label= paste0(mvap_opp, " BIPOC-Influence districts")), size=3, color="#e6a8ac") +
  scale_y_continuous(labels = scales::percent_format()) +
  labs(y = "Percent Minority-Voting Age Population",
       title = "Congressional Maps Range Comparison")

hvap_violin <- ggplot(two, aes(x=map, y=pct_hvap)) + geom_violin() + geom_count(alpha=0.5, size = 2) +
  theme(panel.background = element_blank(),
        axis.title.x = element_blank(),
        axis.ticks.x = element_blank(),
        legend.position = "none") +
  annotate("rect", xmin = 0, 
           xmax = 3,
           ymin = c(0, .37, .5),
           ymax =c(.37, .5, 1), 
           alpha = .70, fill = c("#ffffff", "#fdbe85", "#a63603"))  +
  geom_text(data=counts,aes(x=map,y=1.08,label= paste0(hvap_maj, " Hispanic-Majority districts")), size=3, color="#a63603") +
  geom_text(data=counts,aes(x=map,y=1.03,label= paste0(hvap_opp, " Hispanic-Influence districts")), size=3, color="#e6a973") +
  scale_y_continuous(labels = scales::percent_format()) +
  labs(y = "Percent Hispanic-Voting Age Population",
       title = "Congressional Maps Range Comparison")

avap_violin <- ggplot(two, aes(x=map, y=pct_avap)) + geom_violin() + geom_count(alpha=0.5, size = 2) +
  theme(panel.background = element_blank(),
        axis.title.x = element_blank(),
        axis.ticks.x = element_blank(),
        legend.position = "none") +
  annotate("rect", xmin = 0, 
           xmax = 3,
           ymin = c(0, .37, .5),
           ymax =c(.37, .5, 1), 
           alpha = .70, fill = c("#ffffff", "#bae4b3", "#006d2c"))  +
  geom_text(data=counts,aes(x=map,y=1.08,label= paste0(avap_maj, " Asian-Majority districts")), size=3, color="#006d2c") +
  geom_text(data=counts,aes(x=map,y=1.03,label= paste0(avap_opp, " Asian-Influence districts")), size=3, color="#92bf8a") +
  scale_y_continuous(labels = scales::percent_format()) +
  labs(y = "Percent Asian-Voting Age Population",
       title = "Congressional Maps Range Comparison")

ggsave(partisan_violin, filename = paste0(out_filepath, dtype, "_partisan_violin.png"),  
       bg = "transparent", width = 10)

ggsave(bvap_violin, filename = paste0(out_filepath, dtype, "_bvap_violin.png"),  
       bg = "transparent", width = 10)

ggsave(mvap_violin, filename = paste0(out_filepath, dtype, "_mvap_violin.png"),  
       bg = "transparent", width = 10)

ggsave(avap_violin, filename = paste0(out_filepath, dtype, "_avap_violin.png"),  
       bg = "transparent", width = 10)

ggsave(hvap_violin, filename = paste0(out_filepath, dtype, "_hvap_violin.png"),  
       bg = "transparent", width = 10)
