(() => {
  const visual = {
    eclipse: { type: 0, tint: '#081831', waterY: 1085 },
    'blood-moon': { type: 1, tint: '#18091b', waterY: 903 },
    aurora: { type: 2, tint: '#061630', waterY: 945 }
  };

  function draw(ctx, layout, id, elapsed, remaining, reducedMotion) {
    if (!Object.hasOwn(visual, id)) return;
    const effect = visual[id];
    const { type, tint, waterY } = effect;
    const { x: cx, y: cy } = layout.waterPoint(.50, waterY);
    const t = reducedMotion ? 3.5 : elapsed;
    const W = 1080, H = 1920;
    const smooth = (a, b, value) => {
      const p = Math.min(1, Math.max(0, (value - a) / (b - a)));
      return p * p * (3 - 2 * p);
    };
    const onset=smooth(.32,2,t), leave=smooth(0,.69,remaining), level=onset*leave;
    const glow=(x,y,rx,ry,color,alpha)=>{
      ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(rx,ry);
      const g=ctx.createRadialGradient(0,0,0,0,0,1);
      g.addColorStop(0,color);g.addColorStop(1,color.slice(0,7)+'00');
      ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
    };
    ctx.save();
    ctx.globalAlpha=level*(type===0?.60:type===1?.66:.16);
    ctx.fillStyle=tint;ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=1;
    ctx.save();
    const beam=(sx,sy,ex,ey,startWidth,endWidth,rgb,strength)=>{
      const dx=ex-sx,dy=ey-sy,length=Math.hypot(dx,dy);
      ctx.save();
      ctx.translate(sx,sy);
      ctx.rotate(Math.atan2(dy,dx)-Math.PI/2);
      const falloff=ctx.createLinearGradient(0,0,0,length);
      falloff.addColorStop(0,'rgba('+rgb+','+strength*.53+')');
      falloff.addColorStop(.29,'rgba('+rgb+','+strength+')');
      falloff.addColorStop(.70,'rgba('+rgb+','+strength*.45+')');
      falloff.addColorStop(1,'rgba('+rgb+',0)');
      ctx.fillStyle=falloff;
      for(let i=0;i<7;i++){
        const spread=1-i*.12;
        ctx.globalAlpha=.26;
        ctx.beginPath();
        ctx.moveTo(-startWidth*spread,0);
        ctx.quadraticCurveTo(-endWidth*spread*.53,length*.54,-endWidth*spread,length);
        ctx.lineTo(endWidth*spread,length);
        ctx.quadraticCurveTo(endWidth*spread*.53,length*.54,startWidth*spread,0);
        ctx.closePath();ctx.fill();
      }
      ctx.restore();
    };
    const eclipseX=886,eclipseY=366,radius=89;
    const edge=smooth(.56,1.15,t)*(1-smooth(1.3,1.97,t));
    const reveal=smooth(.20,1.53,t)*leave;
    ctx.save();
    ctx.globalCompositeOperation='screen';
    if(type===0){
      glow(eclipseX,eclipseY,254,210,'#526eaf',reveal*.55);
      glow(eclipseX,eclipseY,191,168,'#e7b477',reveal*.23);
      for(let j=0;j<44;j++){
        const theta=j/44*Math.PI*2;
        const prominence=.39+.36*Math.sin(j*2.399)**2+.25*Math.sin(j*.181-t*.72)**2;
        const length=16+prominence*(37+29*Math.sin(theta*3+1)**2);
        const inner=radius-5,outer=radius+length;
        const startX=eclipseX+Math.cos(theta)*inner,startY=eclipseY+Math.sin(theta)*inner;
        const endX=eclipseX+Math.cos(theta+.05)*outer,endY=eclipseY+Math.sin(theta+.05)*outer;
        const taper=ctx.createLinearGradient(startX,startY,endX,endY);
        taper.addColorStop(0,'rgba(255,225,179,'+(reveal*prominence*.37)+')');
        taper.addColorStop(.28,'rgba(177,188,241,'+(reveal*prominence*.19)+')');
        taper.addColorStop(1,'rgba(148,166,229,0)');
        ctx.strokeStyle=taper;ctx.lineWidth=1.8+prominence*2.6;
        ctx.beginPath();ctx.moveTo(startX,startY);
        ctx.quadraticCurveTo(eclipseX+Math.cos(theta+.02)*(radius+length*.50),eclipseY+Math.sin(theta+.02)*(radius+length*.50),endX,endY);
        ctx.stroke();
      }
      const corona=ctx.createRadialGradient(eclipseX,eclipseY,radius-4,eclipseX,eclipseY,radius+24);
      corona.addColorStop(0,'rgba(255,246,211,'+reveal*.91+')');
      corona.addColorStop(.24,'rgba(244,198,127,'+reveal*.49+')');
      corona.addColorStop(1,'rgba(203,178,255,0)');
      ctx.fillStyle=corona;ctx.beginPath();ctx.arc(eclipseX,eclipseY,radius+24,0,Math.PI*2);ctx.fill();
      const flareX=eclipseX+Math.cos(-.57)*radius,flareY=eclipseY+Math.sin(-.57)*radius;
      glow(flareX,flareY,92,42,'#ffe09c',edge*.73);
      glow(flareX,flareY,56,15,'#fff6d3',edge*.90);
    }else if(type===1){
      const moonPulse=.88+.12*Math.sin(t*2.46);
      glow(829,-12,330,345,'#e9444c',level*.78);
      glow(818,21,182,188,'#ff8c70',level*.63);
      beam(825,0,356,1320,44,273,'255,78,84',level*.33*moonPulse);
      beam(848,-10,555,1252,18,151,'255,105,85',level*.38*moonPulse);
      beam(788,-4,194,1045,12,103,'247,79,103',level*.26*moonPulse);
      beam(884,-5,727,1194,9,95,'241,61,98',level*.23*moonPulse);
    }else{
      const shimmer=.83+.17*Math.sin(t*1.38);
      const light=['96,255,171','71,221,255','189,118,255'];
      for(let j=0;j<light.length;j++){
        const appear=smooth(.32+j*.28,1.62+j*.26,t)*leave;
        const shift=31*Math.sin(t*.89+j*1.7);
        const sx=196+j*245;
        const ex=214+j*280+shift;
        const rgb=light[j];
        beam(sx,-6,ex,1190+j*46,22,173,rgb,appear*.28*shimmer);
        beam(sx+37,-10,ex+58,1130+j*74,8,80,rgb,appear*.23*shimmer);
        glow(sx,63,255,189,['#53ffd8','#5fb4ff','#c68bff'][j],appear*.34);
      }
    }
    ctx.restore();
    if(type===0){
      ctx.save();
      ctx.globalAlpha=reveal;
      const shade=ctx.createRadialGradient(eclipseX-25,eclipseY+21,12,eclipseX,eclipseY,radius);
      shade.addColorStop(0,'#0b1022');shade.addColorStop(.63,'#040713');shade.addColorStop(1,'#02040b');
      ctx.fillStyle=shade;ctx.beginPath();ctx.arc(eclipseX,eclipseY,radius,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#d8c4a6';ctx.lineWidth=1.4;ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation='screen';
      glow(eclipseX+Math.cos(-.57)*radius,eclipseY+Math.sin(-.57)*radius,22,14,'#fff4d3',edge);
      ctx.restore();
    }

    ctx.clip(layout.water);
    ctx.globalCompositeOperation='screen';
    if(type===0){
      const edge=smooth(.8,1.18,t)*(1-smooth(1.26,1.8,t));
      glow(cx,cy,175,109,'#ffcc84',edge*.55);
      glow(cx,cy,119,77,'#fff8d4',edge*.76);
      for(let i=0;i<4;i++){
        ctx.beginPath();ctx.ellipse(cx,cy,54+i*12,21+i*5,0,0,2*Math.PI);
        ctx.strokeStyle='rgba(205,231,255,'+(level*(.14-i*.021)*(.75+.25*Math.sin(t*1.5-i)))+')';
        ctx.lineWidth=2.3-i*.24;ctx.stroke();
      }
      for(let i=0;i<6;i++){
        const p=Math.min(1,Math.max(0,(t-1.19-i*.17)/2.5));
        if(p<=0||p>=1)continue;
        ctx.beginPath();ctx.ellipse(cx,cy,16+p*221,8+p*87,0,0,2*Math.PI);
        ctx.strokeStyle='rgba(199,229,255,'+((1-p)**1.6*.29*leave)+')';ctx.lineWidth=2.6*(1-p)+.6;ctx.stroke();
      }
      for(let i=0;i<34;i++){
        const y=cy-270+i*16.5;
        const x=cx+Math.sin(i*.66+t*1.41)*33+Math.sin(i*2.399)*105;
        const w=(6+((i*13)%28))*(.5+.5*Math.sin(i*.47+t*2)**2);
        glow(x,y,w,2.7,'#c8e9ff',level*(.11+.17*Math.sin(i*.38+t*2)**2));
      }
    }else if(type===1){
      const pulse=.71+.17*Math.sin(t*2.1)+.11*Math.sin(t*3.15);
      glow(cx,cy+26,330,451,'#a32947',level*.52*pulse);
      for(let i=0;i<51;i++){
        const y=cy-390+i*18.2;
        const spread=78+Math.max(0,y-cy)*.22;
        const middle=cx+42*Math.sin(y*.006+t*.92)+21*Math.sin(y*.019-t*1.9);
        const x=middle+Math.sin(i*2.399)*spread*(.27+.73*Math.sin(i*.127)**2);
        const brightness=(.45+.55*Math.sin(i*.95-t*2.25)**2)*level;
        glow(x,y,6+(i*19%51),1.3+(i%5)*.72,i%3===0?'#ffbe8b':'#fb684c',brightness*(i%3===0?.91:.66)*pulse);
      }
      for(let j=0;j<3;j++){
        const p=(t*.42+j*.33)%1;
        glow(cx+Math.sin(j*2+t)*48,cy-230+p*540,180,75,'#d4535b',level*.1*Math.sin(p*Math.PI));
      }
    }else{
      const colors=['#2cf3b4','#518dfc','#b578ff'];
      for(let k=0;k<3;k++){
        const base=cy-246+k*163;
        const move=18*Math.sin(t*.8+k);
        const a=level*smooth(.50+k*.31,2.2+k*.24,t);
        for(let i=0;i<25;i++){
          const x=143+i*32;
          const y=base+102*Math.sin(x*.0039+t*.62+k*1.4)+35*Math.sin(x*.012-t*.9)+move;
          const fold=.57+.43*Math.sin(i*.62+t*1.76+k)**2;
          glow(x,y,48,36+22*fold,colors[k],a*.205*fold);
          glow(x,y+8,29,9,colors[k],a*.12*fold);
        }
      }
      for(let j=0;j<24;j++){
        const y=cy-190+(j*97)%470;
        const x=145+(j*149)%790+Math.sin(t+j)*21;
        glow(x,y+4*Math.sin(t*.9+j),6,6,'#d0fff2',level*.22*(.5+.5*Math.sin(j+t)**2));
      }
    }
    ctx.restore();
    ctx.restore();
  }

  window.PondAnomalyEffects = { draw };
})();
