/* global okresy */
/* jshint esversion: 6 */
// custom graph component
Vue.component('graph', {

  props: ['graphData', 'day', 'resize'],

  template: '<div ref="graph" id="graph" style="height: 100%;"></div>',

  methods: {

    mountGraph() {

      Plotly.newPlot(this.$refs.graph, [], {}, {responsive: true});

      this.$refs.graph.on('plotly_hover', this.onHoverOn)
        .on('plotly_unhover', this.onHoverOff)
        .on('plotly_relayout', this.onLayoutChange);

    },

    onHoverOn(data) {

      let curveNumber = data.points[0].curveNumber;
      let name = this.graphData.traces[curveNumber].name;

      if (name) {

        this.traceIndices = this.graphData.traces.map((e, i) => e.name == name ? i : -1).filter(e => e >= 0);
        let update = {'line': {color: 'rgba(254, 52, 110, 1)'}};

        for (let i of this.traceIndices) {
          Plotly.restyle(this.$refs.graph, update, [i]);
        }
      }

    },

    onHoverOff() {

      let update = {'line': {color: 'rgba(0,0,0,0.15)'}};

      for (let i of this.traceIndices) {
        Plotly.restyle(this.$refs.graph, update, [i]);
      }

    },

    onLayoutChange(data) {

      this.emitGraphAttributes();

      // if the user selects autorange, go back to the default range
      if (data['xaxis.autorange'] == true || data['yaxis.autorange'] == true) {
        this.userSetRange = false;
        this.updateGraph();
      }

      // if the user selects a custom range, use this
      else if (data['xaxis.range[0]']) {
        this.xrange = [data['xaxis.range[0]'], data['xaxis.range[1]']].map(e => parseFloat(e));
        this.yrange = [data['yaxis.range[0]'], data['yaxis.range[1]']].map(e => parseFloat(e));
        this.userSetRange = true;
      }

    },

    updateGraph() {

      // we're deep copying the layout object to avoid side effects
      // because plotly mutates layout on user input
      // note: this may cause issues if we pass in date objects through the layout
      let layout = JSON.parse(JSON.stringify(this.graphData.layout));

      // if the user selects a custom range, use it
      if (this.userSetRange) {
        layout.xaxis.range = this.xrange;
        layout.yaxis.range = this.yrange;
      }

      Plotly.react(this.$refs.graph, this.graphData.traces, layout, this.graphData.config);

    },

    calculateAngle() {
      if (this.graphData.uistate.showTrendLine && this.graphData.uistate.doublingTime > 0) {
        let element = this.$refs.graph.querySelector('.cartesianlayer').querySelector('.plot').querySelector('.scatterlayer').lastChild.querySelector('.lines').firstChild.getAttribute('d');
        let pts = element.split('M').join(',').split('L').join(',').split(',').filter(e => e != '');
        let angle = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]);
        return angle;
      } else {
        return NaN;
      }
    },

    emitGraphAttributes() {
      let graphOuterDiv = this.$refs.graph.querySelector('.main-svg').attributes;
      this.$emit('update:width', graphOuterDiv.width.nodeValue);
      this.$emit('update:height', graphOuterDiv.height.nodeValue);

      let graphInnerDiv = this.$refs.graph.querySelector('.xy').firstChild.attributes;
      this.$emit('update:innerWidth', graphInnerDiv.width.nodeValue);
      this.$emit('update:innerHeight', graphInnerDiv.height.nodeValue);
      this.$emit('update:referenceLineAngle', this.calculateAngle());
    }

  },

  mounted() {
    this.mountGraph();

    if (this.graphData) {
      this.updateGraph();
    }

    this.emitGraphAttributes();
    this.$emit('update:mounted', true);

  },

  watch: {

    graphData: {

      deep: true,

      handler(data, oldData) {

        // if UI state changes, revert to auto range
        if (JSON.stringify(data.uistate) != JSON.stringify(oldData.uistate)) {
          this.userSetRange = false;
        }

        this.updateGraph();
        this.$emit('update:referenceLineAngle', this.calculateAngle());

      }

    },

    resize() {
      Plotly.Plots.resize(this.$refs.graph);
    },

  },

  data() {
    return {
      xrange: [], // stores user selected xrange
      yrange: [], // stores user selected yrange
      userSetRange: false, // determines whether to use user selected range
      traceIndices: [],
    };
  }

});

// global data
window.app = new Vue({

  el: '#root',

  mounted() {
    this.pullData(this.selectedData);
  },

  created: function() {

    let url = window.location.href.split('?');

    if (url.length > 1) {

      let urlParameters = new URLSearchParams(url[1]);

      if (urlParameters.has('scale')) {

        let myScale = urlParameters.get('scale').toLowerCase();

        if (myScale == 'log') {
          this.selectedScale = 'logaritmická škála';
        } else if (myScale == 'linear') {
          this.selectedScale = 'lineárna škála';
        }
      }

      if (urlParameters.has('data')) {
        let myData = urlParameters.get('data').toLowerCase();
        if (myData == 'cases') {
          this.selectedData = 'potvrdených prípadov';
        } else if (myData == 'deaths') {
          this.selectedData = 'Reported Deaths';
        }

      }

      if (urlParameters.has('location')) {
        this.selectedCountries = urlParameters.getAll('location');
      }

      if (urlParameters.has('trendline')) {
        let showTrendLine = urlParameters.get('trendline');
        this.showTrendLine = (showTrendLine == 'true');
      } else if (urlParameters.has('doublingtime')) {
        let doublingTime = urlParameters.get('doublingtime');
        this.doublingTime = doublingTime;
      }
      
      if (urlParameters.has('newCasesLimit')) {
        this.showNewCasesLimit = true;
        this.newCasesLimit = +urlParameters.get('newCasesLimit') || 750;
      }

      if (urlParameters.has('perMillion')) {
        let perMillion = urlParameters.get('perMillion');
        this.perMillion = (perMillion == 'true');
      } else this.perMillion = false;

      if (urlParameters.has('startAtDay')) {
        this.enableStartAt = true;
        this.startAtDay = +urlParameters.get('startAtDay') || 0;
      }

      if (urlParameters.has('select')) {
        this.mySelect = urlParameters.get('select').toLowerCase();
      }

    }

    window.addEventListener('keydown', e => {

      if ((e.key == ' ') && this.dates.length > 0) {
        this.play();
      }

      else if ((e.key == '-' || e.key == '_') && this.dates.length > 0) {
        this.paused = true;
        this.day = Math.max(this.day - 1, this.minDay);
      }

      else if ((e.key == '+' || e.key == '=') && this.dates.length > 0) {
        this.paused = true;
        this.day = Math.min(this.day + 1, this.dates.length);
      }

    });

  },

  watch: {
    selectedData() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, /*updateSelectedCountries*/ false);
      }
      this.searchField = '';
    },

    perMillion() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, /*updateSelectedCountries*/ false);
      }
      this.searchField = '';
    },

    enableStartAt() {
      if (this.enableStartAt) {
        this.day = this.startAtDay;
        if (this.paused && !this.autoplay) this.play();
      }
    },

    startAtDay() {
      this.day = this.startAtDay = Math.min(this.dates.length, Math.max(this.minDay, this.startAtDay));
      if (this.enableStartAt && this.paused && !this.autoplay) this.play();
    },

    minDay() {
      if (this.day < this.minDay) {
        this.day = this.minDay;
      }
    },

    'graphAttributes.mounted': function() {

      if (this.graphAttributes.mounted && this.autoplay && this.minDay > 0) {
        this.startAtDay = Math.max(this.minDay, this.startAtDay);
        this.day = Math.min(this.dates.length, this.startAtDay);
        if (this.day < this.dates.length) this.play();
        this.autoplay = false; // disable autoplay on first play
      }
    },

    searchField() {
      let debouncedSearch = this.debounce(this.search, 250, false);
      debouncedSearch();
    }
  },

  methods: {

    debounce(func, wait, immediate) { // https://davidwalsh.name/javascript-debounce-function
      var timeout;
      return function() {
        var context = this, args = arguments;
        var later = function() {
          timeout = null;
          if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
      };
    },

    myMax() { // https://stackoverflow.com/a/12957522
      var par = [];
      for (var i = 0; i < arguments.length; i++) {
        if (!isNaN(arguments[i])) {
          par.push(arguments[i]);
        }
      }
      return Math.max.apply(Math, par);
    },

    myMin() {
      var par = [];
      for (var i = 0; i < arguments.length; i++) {
        if (!isNaN(arguments[i])) {
          par.push(arguments[i]);
        }
      }
      return Math.min.apply(Math, par);
    },

    addSyntheticRegion(level, newName, parts) {
      const includedRegions = this.covidData.filter(okres => parts.includes(okres.country));
      if (includedRegions.length != parts.length) return;

      const newRegion = {
        country: newName,
        level: level,
        cases: includedRegions.map(e => e.cases).reduce((acc, cur) => cur.map((e, i) => e + (acc[i] ? acc[i] : 0)), []),
        population: includedRegions.map(e => e.population).reduce((acc, cur) => acc + cur, 0)
      };
      newRegion.maxCases = Math.max(...newRegion.cases);

      this.covidData.push(newRegion);
    },

    pullData(selectedData, updateSelectedCountries = true) {

      const Httpreq = new XMLHttpRequest(); // a new request
      Httpreq.open("GET", "https://mapa.covid.chat/map_data/daily", false);
      Httpreq.send(null);         
      const rawData = JSON.parse(Httpreq.responseText).days;
      
      const dates = [];

      const poOkresoch = [];
      for (let istr in okresy) {
        const i = parseInt(istr, 10);
        poOkresoch[i] = {
          country: okresy[istr].title,
          level: 4,
          cases: [],
          maxCases: 0,
          population: okresy[istr].population
        };
      }

      for (let dayiter = 0; dayiter < rawData.length; dayiter++) {
        const dd = rawData[dayiter];
        dates.push(dd.day.replace(/-/g, '.'));

        for (let okriter = 0; okriter < dd.list.length; okriter++) {
          const i = parseInt(dd.list[okriter].id, 10);
          if (!poOkresoch[i]) continue;
          const cases = parseInt(dd.list[okriter].infected);
          poOkresoch[i].cases.push(cases);
          if (poOkresoch[i].maxCases < cases) poOkresoch[i].maxCases = cases;
        }
      }

      //odstran posledny den ak vsetko rovnake ako den predtym - zrejme este nie su udaje
      if (poOkresoch.every(o => Object.is(o.cases[o.cases.length - 1], o.cases[o.cases.length - 2]))) { //nie je pouzite === kvoli NaN
        dates.pop();
        poOkresoch.forEach(o => o.cases.pop());
      }

      this.dates = dates;
      this.day = this.dates.length;

      //id nie su dalej zajimave, vypusti medzery z pola
      this.covidData = poOkresoch.filter(() => true);

      this.addSyntheticRegion(3, "Orava (región)", ["Dolný Kubín", "Námestovo", "Tvrdošín"]);
      this.addSyntheticRegion(3, "Kysuce (región)", ["Čadca", "Kysucké Nové Mesto"]);
      this.addSyntheticRegion(3, "Horná Nitra (región)", ["Bánovce nad Bebravou", "Partizánske", "Prievidza", "Topoľčany"]);
      this.addSyntheticRegion(3, "Záhorie (región)", ["Malacky", "Senica", "Skalica"]);
      this.addSyntheticRegion(3, "Gemer-Malohont (región)", ["Rimavská Sobota", "Revúca", "Rožňava"]);
      this.addSyntheticRegion(3, "Horehronie (región)", ["Banská Bystrica", "Brezno"]);
      this.addSyntheticRegion(3, "Podpoľanie (región)", ["Detva", "Krupina", "Zvolen"]);
      this.addSyntheticRegion(3, "Spiš (región)", ["Kežmarok", "Spišská Nová Ves", "Gelnica", "Košice - okolie", "Levoča", "Stará Ľubovňa", "Poprad"]);
      this.addSyntheticRegion(3, "Turiec (región)", ["Martin", "Turčianske Teplice"]);
      this.addSyntheticRegion(3, "Liptov (región)", ["Ružomberok", "Liptovský Mikuláš"]);
      this.addSyntheticRegion(3, "Šariš (región)", ["Bardejov", "Prešov", "Sabinov", "Stropkov", "Svidník"]);
      this.addSyntheticRegion(3, "Dolný Zemplín (región)", ["Michalovce", "Sobrance", "Trebišov"]);
      this.addSyntheticRegion(3, "Horný Zemplín (región)", ["Humenné", "Medzilaborce", "Snina", "Vranov nad Topľou", "Stropkov"]);
      this.addSyntheticRegion(2, "Bratislavský kraj", ["Bratislava", "Malacky", "Pezinok", "Senec"]);
      this.addSyntheticRegion(2, "Trnavský kraj", ["Dunajská Streda", "Galanta", "Hlohovec", "Piešťany", "Senica", "Skalica", "Trnava"]);
      this.addSyntheticRegion(2, "Trenčiansky kraj", ["Bánovce nad Bebravou", "Ilava", "Myjava", "Nové Mesto nad Váhom", "Partizánske", "Považská Bystrica", "Prievidza", "Púchov", "Trenčín"]);
      this.addSyntheticRegion(2, "Nitriansky kraj", ["Komárno", "Levice", "Nitra", "Nové Zámky", "Šaľa", "Topoľčany", "Zlaté Moravce"]);
      this.addSyntheticRegion(2, "Žilinský kraj", ["Bytča", "Čadca", "Dolný Kubín", "Kysucké Nové Mesto", "Liptovský Mikuláš", "Martin", "Námestovo", "Ružomberok", "Turčianske Teplice", "Tvrdošín", "Žilina"]);
      this.addSyntheticRegion(2, "Banskobystrický kraj", ["Banská Bystrica", "Banská Štiavnica", "Brezno", "Detva", "Krupina", "Lučenec", "Poltár", "Revúca", "Rimavská Sobota", "Veľký Krtíš", "Zvolen", "Žarnovica", "Žiar nad Hronom"]);
      this.addSyntheticRegion(2, "Prešovský kraj", ["Bardejov", "Humenné", "Kežmarok", "Levoča", "Medzilaborce", "Poprad", "Prešov", "Sabinov", "Snina", "Stará Ľubovňa", "Stropkov", "Svidník", "Vranov nad Topľou"]);
      this.addSyntheticRegion(2, "Košický kraj", ["Gelnica", "Košice", "Košice - okolie", "Michalovce", "Rožňava", "Sobrance", "Spišská Nová Ves", "Trebišov"]);
      this.addSyntheticRegion(1, "Slovenská Republika", ["Banskobystrický kraj", "Bratislavský kraj", "Košický kraj", "Nitriansky kraj", "Prešovský kraj", "Trenčiansky kraj", "Trnavský kraj", "Žilinský kraj"]);

      this.covidData.forEach(okres => {
        if (this.perMillion) okres.cases = okres.cases.map(c => c * 10000 / okres.population);
        okres.slope = okres.cases.map((e, i, a) => e - a[i - this.lookbackTime]);
      });

      this.countries = this.covidData.map(e => [e.level, e.country]).sort().map(e => e[1]);
      this.visibleCountries = this.countries;
      const topCountries = this.covidData.sort((a, b) => b.maxCases - a.maxCases).slice(0, 9).map(e => e.country);


      // TODO: clean this logic up later
      // expected behavior: generate/overwrite selected locations if: 1. data loaded from URL, but no selected locations are loaded. 2. data refreshed (e.g. changing region)
      // but do not overwrite selected locations if 1. selected locations loaded from URL. 2. We switch between confirmed cases <-> deaths
      if ((this.selectedCountries.length === 0 || !this.firstLoad) && updateSelectedCountries) {
        this.selectedCountries = this.countries.filter(e => topCountries.includes(e));
        
        this.defaultCountries = this.selectedCountries; // Used for createURL default check
        
        if (this.mySelect == 'all') {
          this.selectedCountries = this.countries;
        } else if (this.mySelect == 'none') {
          this.selectedCountries = [];
        }
        this.mySelect = '';
      
      }

      this.firstLoad = false;
      this.createURL();
    },

    formatDate(date) {
      if (!date) return '';
      else return date;
    },

    // TODO: clean up play/pause logic
    play() {
      if (this.paused) {

        if (this.day == this.dates.length) {
          this.day = this.enableStartAt ? this.startAtDay : this.minDay;
        }

        this.paused = false;
        setTimeout(this.increment, 10);

      } else {
        this.paused = true;
      }

    },

    pause() {
      if (!this.paused) {
        this.paused = true;
      }
    },

    increment() {

      if (this.day == this.dates.length || this.minDay < 0) {
        this.day = this.dates.length;
        this.paused = true;
      }
      else if (this.day < this.dates.length) {
        if (!this.paused) {
          this.day++;
          setTimeout(this.increment, 200);
        }
      }

    },

    search() {
      this.visibleCountries = this.countries.filter(e => e.toLowerCase().includes(this.searchField.toLowerCase()));
    },

    selectAll() {
      this.selectedCountries = this.countries;
      this.createURL();
    },

    deselectAll() {
      this.selectedCountries = [];
      this.createURL();
    },

    toggleHide() {
      this.isHidden = !this.isHidden;
    },
    
    createURL() {
      
      let queryUrl = new URLSearchParams();

      if (this.selectedScale == 'lineárna škála') {
        queryUrl.append('scale', 'linear');
      }

      if (this.selectedData == 'Reported Deaths') {
        queryUrl.append('data', 'deaths');
      }

      // since this rename came later, use the old name for URLs to avoid breaking existing URLs
      let renames = {'China (Mainland)': 'China'};
            
      if (!this.showTrendLine) {
        queryUrl.append('trendline', this.showTrendLine);
      } 

      else if (this.doublingTime != 2) {
        queryUrl.append('doublingtime', this.doublingTime);
      }

      if (this.showNewCasesLimit) {
        queryUrl.append('newCasesLimit', this.newCasesLimit);
      }

      if (this.perMillion) {
        queryUrl.append('perMillion', this.perMillion);
      }

      if (this.enableStartAt) {
        queryUrl.append('startAtDay', this.startAtDay);
      }

      // check if no countries selected
      // edge case: since selectedCountries may be larger than the country list (e.g. when switching from Confirmed Cases to Deaths), we can't simply check if selectedCountries is empty
      // so instead we check if the countries list does not include any of the selected countries
      if (!this.countries.some(country => this.selectedCountries.includes(country))) {
        queryUrl.append('select', 'none');
      } 

      // check if all countries selected
      // edge case: since selectedCountries may be larger than the country list (e.g. when switching from Confirmed Cases to Deaths), we can't simply compare array contents
      // so instead we check if the countries list is a proper subset of selectedCountries
      else if (this.countries.every(country => this.selectedCountries.includes(country))) {
        queryUrl.append('select', 'all');
      } 

      // else check if selection is different from default countries
      else if (JSON.stringify(this.selectedCountries.sort()) !== JSON.stringify(this.defaultCountries)) {

        // only append to URL the selected countries that are also in the currently displayed country list
        // this is done because of the edge case where selectedCountries may be larger than the country list (e.g. when switching from Confirmed Cases to Deaths)
        let countriesToAppendToUrl = this.selectedCountries.filter(e => this.countries.includes(e));

        // apply renames and append to queryUrl
        countriesToAppendToUrl = countriesToAppendToUrl.map(country => Object.keys(renames).includes(country) ? renames[country] : country);
        countriesToAppendToUrl.forEach(country => queryUrl.append('location', country));
      }

      if (queryUrl.toString() == '') {
        window.history.replaceState({}, 'Covid Trends', location.pathname);
      } else {
        window.history.replaceState({}, 'Covid Trends', '?' + queryUrl.toString());
      }

    },

    // reference line for exponential growth with a given doubling time
    referenceLine(x) {
      return x * (1 - Math.pow(2, -this.lookbackTime / this.doublingTime));
    }

  },

  computed: {

    filteredCovidData() {
      return this.covidData.filter(e => this.selectedCountries.includes(e.country));
    },

    minDay() {
      let minDay = this.myMin(...(this.filteredCovidData.map(e => e.slope.findIndex(f => f > 0)).filter(x => x != -1)));
      if (isFinite(minDay) && !isNaN(minDay)) {
        return minDay + 1;
      } else {
        return -1;
      }
    },

    annotations() {

      return [{
        visible: this.showTrendLine && this.doublingTime > 0,
        x: this.xAnnotation,
        y: this.yAnnotation,
        xref: 'x',
        yref: 'y',
        xshift: -50 * Math.cos(this.graphAttributes.referenceLineAngle),
        yshift: 50 * Math.sin(this.graphAttributes.referenceLineAngle),
        text: 'za ' + this.doublingTime + ' ' + (this.doublingTime < 5 ? this.doublingTime == 1 ? 'deň' : 'dni' : 'dní') + ' zdvojnásobenie<br>' + this.selectedData,
        align: 'right',
        showarrow: false,
        textangle: this.graphAttributes.referenceLineAngle * 180 / Math.PI,
        font: {
          family: 'Open Sans, sans-serif',
          color: 'grey',
          size: 14
        },
      },
      {
        visible: this.perMillion && this.showNewCasesLimit,
        x: this.xNewCasesLimitAnnotation,
        y: this.selectedScale == 'logaritmická škála' ? Math.log10(this.newCasesLimitPerWeekAndMillion) : this.newCasesLimitPerWeekAndMillion,
        xref: 'x',
        yref: 'y',
        text: 'v SR ' + this.newCasesLimit + ' novo nakazených za deň<br>t.j. ' + this.newCasesLimitPerWeekAndMillion + ' za týždeň na 10k obyvateľov',
        align: 'right',
        showarrow: false,
        font: {
          family: 'Open Sans, sans-serif',
          color: 'grey',
          size: 14
        }
      }];

    },

    layout() {
      return {
        title: 'Priebeh COVID-19 ' + this.selectedData + ' v okresoch Slovenska (do ' + this.formatDate(this.dates[this.day - 1]) + ')',
        showlegend: false,
        autorange: false,
        xaxis: {
          title: 'Spolu ' + this.selectedData + (this.perMillion ? ' na 10000 obyvateľov' : ''),
          type: this.selectedScale == 'logaritmická škála' ? 'log' : 'linear',
          range: this.selectedScale == 'logaritmická škála' ? this.logxrange : this.linearxrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        yaxis: {
          title: 'Nových ' + this.selectedData + ' (za posledný týždeň)' + (this.perMillion ? ' na 10000 obyvateľov' : ''),
          type: this.selectedScale == 'logaritmická škála' ? 'log' : 'linear',
          range: this.selectedScale == 'logaritmická škála' ? this.logyrange : this.linearyrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        hovermode: 'closest',
        font: {
          family: 'Open Sans, sans-serif',
          color: 'black',
          size: 14
        },
        annotations: this.annotations
      };
    },

    traces() {

      let showDailyMarkers = this.filteredCovidData.length <= 2;

      // draws grey lines (line plot for each location)
      let trace1 = this.filteredCovidData.map((e, i) => ({
        x: e.cases.slice(0, this.day),
        y: e.slope.slice(0, this.day),
        name: e.country,
        text: this.dates.map(date => e.country + '<br>' + date),
        mode: showDailyMarkers ? 'lines+markers' : 'lines',
        type: 'scatter',
        legendgroup: i,
        marker: {
          size: 4,
          color: 'rgba(0,0,0,0.15)'
        },
        line: {
          color: 'rgba(0,0,0,0.15)'
        },
        hoverinfo: 'x+y+text',
        hovertemplate: '%{text}<br>Spolu ' + this.selectedData + ': %{x:,}<br>Za posledný týždeň: %{y:,}<extra></extra>',
      })
      );

      // draws red dots (most recent data for each location)
      let trace2 = this.filteredCovidData.map((e, i) => ({
        x: [e.cases[this.day - 1]],
        y: [e.slope[this.day - 1]],
        text: e.country,
        name: e.country,
        mode: this.showLabels ? 'markers+text' : 'markers',
        legendgroup: i,
        textposition: 'center right',
        marker: {
          size: 6,
          color: 'rgba(254, 52, 110, 1)'
        },
        hovertemplate: '%{data.text}<br>Spolu ' + this.selectedData + ': %{x:,}<br>Za posledný týždeň: %{y:,}<extra></extra>',

      }));

      let traces = [...trace1, ...trace2];

      if (this.perMillion && this.showNewCasesLimit) {
        const trace4 = [{
          x: [0, 10000],
          y: Array(2).fill(this.newCasesLimitPerWeekAndMillion),
          mode: 'lines',
          line: {
            dash: 'dot'
          },
          marker: {
            color: 'rgba(114, 27, 101, 0.7)'
          },
          hoverinfo: 'skip'
        }];
        traces = [...traces, ...trace4];
      } 

      if (this.showTrendLine && this.doublingTime > 0) {
        let cases = [0.1, 1000000];

        let trace3 = [{
          x: cases,
          y: cases.map(this.referenceLine),
          mode: 'lines',
          line: {
            dash: 'dot',
          },
          marker: {
            color: 'rgba(114, 27, 101, 0.7)'
          },
          hoverinfo: 'skip',
        }];

        // reference line must be last trace for annotation angle to work out
        traces = traces.concat(trace3);

      }

      return traces;
    },

    config() {
      return {
        responsive: true,
        toImageButtonOptions: {
          format: 'png', // one of png, svg, jpeg, webp
          filename: 'Covid Trends',
          height: 600,
          width: 600 * this.graphAttributes.width / this.graphAttributes.height,
          scale: 1 // Multiply title/legend/axis/canvas sizes by this factor
        }
      };
    },

    graphData() {
      return {
        uistate: { // graph is updated when uistate changes
          selectedData: this.selectedData,
          selectedScale: this.selectedScale,
          showLabels: this.showLabels,
          showTrendLine: this.showTrendLine,
          perMillion: this.perMillion,
          doublingTime: this.doublingTime,
          showNewCasesLimit: this.showNewCasesLimit,
          newCasesLimit: this.newCasesLimit,
          enableStartAt: this.enableStartAt,
          startAtDay: this.startAtDay,
        },
        traces: this.traces,
        layout: this.layout,
        config: this.config
      };
    },

    xmax() {
      return Math.max(...this.filteredCases, 50);
    },

    xmin() {
      return Math.min(...this.filteredCases, 50);
    },

    ymax() {
      return Math.max(...this.filteredSlope, 50);
    },

    ymin() {
      return Math.min(...this.filteredSlope);
    },

    filteredCases() {
      let src = this.filteredCovidData.map(e => e.cases);
      if (this.enableStartAt) src = src.map(e => e.slice(this.startAtDay));
      return Array.prototype.concat(...src).filter(e => !isNaN(e));
    },

    filteredSlope() {
      let src = this.filteredCovidData.map(e => e.slope);
      if (this.enableStartAt) src = src.map(e => e.slice(this.startAtDay));
      return Array.prototype.concat(...src).filter(e => !isNaN(e));
    },

    logxrange() {
      return [this.enableStartAt ? Math.log10(0.8 * this.xmin) : this.perMillion ? 0 : 0.5, Math.log10(1.5 * this.xmax)];
    },

    linearxrange() {
      return [0, Math.round(1.2 * this.xmax)];
    },

    logyrange() {
      return [this.enableStartAt ? Math.log10(0.8 * this.ymin) : this.perMillion ? -1.5 : 0, Math.log10(1.2 * this.ymax)];
    },

    linearyrange() {
      let ymax = Math.max(...this.filteredSlope, 50);
      return [-Math.pow(10, Math.floor(Math.log10(ymax)) - 2), Math.round(1.05 * ymax)];
    },

    xAnnotation() {

      if (this.selectedScale == 'logaritmická škála') {
        let x = this.logyrange[1] - Math.log10(this.referenceLine(1));
        if (x < this.logxrange[1]) {
          return x;
        } else {
          return this.logxrange[1];
        }

      } else {
        let x = this.linearyrange[1] / this.referenceLine(1);
        if (x < this.linearxrange[1]) {
          return x;
        } else {
          return this.linearxrange[1];
        }
      }
    },

    yAnnotation() {
      if (this.selectedScale == 'logaritmická škála') {
        let x = this.logyrange[1] - Math.log10(this.referenceLine(1));
        if (x < this.logxrange[1]) {
          return this.logyrange[1];
        } else {
          return this.logxrange[1] + Math.log10(this.referenceLine(1));
        }
      } else {
        let x = this.linearyrange[1] / this.referenceLine(1);
        if (x < this.linearxrange[1]) {
          return this.linearyrange[1];
        } else {
          return this.linearxrange[1] * this.referenceLine(1);
        }
      }

    },

    xNewCasesLimitAnnotation() {
      if (this.selectedScale == 'logaritmická škála') {
        return this.logxrange[1] * 0.9;
      } else {
        return this.linearxrange[1] * 0.9;
      }
    },

    newCasesLimitPerWeekAndMillion() {
      const totalPopulation = this.covidData.reduce((a, b) => a + (b.level == 4 ? b.population : 0), 0);
      return Math.round(1000000 * this.newCasesLimit * 7 / totalPopulation) / 100;
    }

  },

  data: {

    paused: true,

    dataTypes: ['potvrdených prípadov'],

    selectedData: 'potvrdených prípadov',

    sliderSelected: false,

    day: 7,

    lookbackTime: 7,

    scale: ['logaritmická škála', 'lineárna škála'],

    selectedScale: 'logaritmická škála',

    dates: [],

    covidData: [],

    countries: [],

    visibleCountries: [], // used for search

    selectedCountries: [], // used to manually select countries 
    
    defaultCountries: [], // used for createURL default check

    isHidden: true,

    showLabels: true,

    showTrendLine: true,

    perMillion: true,

    doublingTime: 2,

    newCasesLimit: 750,

    showNewCasesLimit: false,
    
    mySelect: '',

    searchField: '',

    autoplay: true,

    enableStartAt: false,

    startAtDay: 0,

    firstLoad: true,

    graphAttributes: {
      mounted: false,
      innerWidth: NaN,
      innerHeight: NaN,
      width: NaN,
      height: NaN,
      referenceLineAngle: NaN
    },

  }

});
