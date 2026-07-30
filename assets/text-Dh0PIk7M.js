const r=e=>e.normalize("NFD").replace(new RegExp("\\p{Diacritic}","gu"),"").trim().replace(/\s+/g," ").toLowerCase(),s=(e,a)=>!!e&&!!a&&r(e)===r(a);export{r as n,s};
