import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Home } from "@/pages/home";
import { StockDetail } from "@/pages/stock";
import { OptionsFlow } from "@/pages/options";
import { IVRadar } from "@/pages/iv-radar";
import { Dashboard } from "@/pages/dashboard";
import { NewsPage } from "@/pages/news";
import { WatchlistPage } from "@/pages/watchlist";
import { ComparePage } from "@/pages/compare";
import { AskDeepberg } from "@/pages/ask-deepberg";
import { ChainHeatmap } from "@/pages/chain-heatmap";
import { SignalsPage } from "@/pages/signals";
import { DailyRecapPage } from "@/pages/daily-recap";
import { PaperTradingPage } from "@/pages/paper-trading";
import { CryptoPage } from "@/pages/crypto";
import { BudgetScreenerPage } from "@/pages/budget-screener";
import { LarpPage } from "@/pages/larp";
import LandingPage from "@/pages/landing";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/market" component={Home} />
      <Route path="/stock/:symbol" component={StockDetail} />
      <Route path="/options" component={OptionsFlow} />
      <Route path="/options/:symbol" component={OptionsFlow} />
      <Route path="/iv-radar" component={IVRadar} />
      <Route path="/news" component={NewsPage} />
      <Route path="/watchlist" component={WatchlistPage} />
      <Route path="/compare" component={ComparePage} />
      <Route path="/ask" component={AskDeepberg} />
      <Route path="/chain" component={ChainHeatmap} />
      <Route path="/signals" component={SignalsPage} />
      <Route path="/options-signals" component={SignalsPage} />
      <Route path="/recap" component={DailyRecapPage} />
      <Route path="/paper" component={PaperTradingPage} />
      <Route path="/crypto" component={CryptoPage} />
      <Route path="/budget-screener" component={BudgetScreenerPage} />
      <Route path="/larp" component={LarpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
